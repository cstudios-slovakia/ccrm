import React, { useState, useMemo } from "react";
import {
  Coins,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Trash2,
  Check
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  SalaryCategoryItem,
  SalaryTypeConfig
} from "../../types";

interface SalariesMatrixViewProps {
  employees: Employee[];
  salaries: EmployeeSalary[];
  settings: EmployeeSettings;
  onSaveSalary: (salary: EmployeeSalary) => void;
  systemLanguage?: string;
  systemCurrency?: string;
  onSelectEmployee?: (employeeId: string) => void;
}

export const SalariesMatrixView: React.FC<SalariesMatrixViewProps> = ({
  employees,
  salaries,
  settings,
  onSaveSalary,
  systemLanguage = "sk",
  systemCurrency = "€",
  onSelectEmployee
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [onlyActive, setOnlyActive] = useState<boolean>(true);

  // Selected cell for edit modal
  const [selectedCell, setSelectedCell] = useState<{
    employee: Employee;
    periodNumber: number;
    periodKey: string;
    salaryRecord: EmployeeSalary | null;
  } | null>(null);

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  const monthNames = useMemo(() => {
    return [
      t("Jan", "Jan", "Jan"),
      t("Feb", "Feb", "Feb"),
      t("Mar", "Mar", "Már"),
      t("Apr", "Apr", "Ápr"),
      t("May", "Máj", "Máj"),
      t("Jun", "Jún", "Jún"),
      t("Jul", "Júl", "Júl"),
      t("Aug", "Aug", "Aug"),
      t("Sep", "Sep", "Szep"),
      t("Oct", "Okt", "Okt"),
      t("Nov", "Nov", "Nov"),
      t("Dec", "Dec", "Dec")
    ];
  }, [systemLanguage]);

  const fullMonthNames = useMemo(() => {
    return [
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
    ];
  }, [systemLanguage]);

  // Filtered employees
  const visibleEmployees = useMemo(() => {
    return employees.filter((emp) => !onlyActive || emp.isActive !== false);
  }, [employees, onlyActive]);

  // Map of [employeeId_periodKey] -> EmployeeSalary
  const salaryMap = useMemo(() => {
    const map = new Map<string, EmployeeSalary>();
    for (const sal of salaries) {
      if (sal.year === selectedYear) {
        map.set(`${sal.employeeId}_${sal.periodKey}`, sal);
      }
    }
    return map;
  }, [salaries, selectedYear]);

  // Calculate Column Totals (Months 1..12)
  const columnTotals = useMemo(() => {
    const totals: Array<{ totalSalary: number; totalPaid: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const periodKey = `${selectedYear}-${String(m).padStart(2, "0")}`;
      let mSalary = 0;
      let mPaid = 0;
      for (const emp of visibleEmployees) {
        const sal = salaryMap.get(`${emp.id}_${periodKey}`);
        if (sal) {
          mSalary += sal.totalSalary || 0;
          mPaid += sal.totalPaid || 0;
        }
      }
      totals.push({ totalSalary: mSalary, totalPaid: mPaid });
    }
    return totals;
  }, [visibleEmployees, salaryMap, selectedYear]);

  // Grand totals for the entire year
  const grandTotal = useMemo(() => {
    return columnTotals.reduce(
      (acc, curr) => ({
        totalSalary: acc.totalSalary + curr.totalSalary,
        totalPaid: acc.totalPaid + curr.totalPaid
      }),
      { totalSalary: 0, totalPaid: 0 }
    );
  }, [columnTotals]);

  // Open Cell Editor
  const handleCellClick = (emp: Employee, monthNum: number) => {
    const periodKey = `${selectedYear}-${String(monthNum).padStart(2, "0")}`;
    const existing = salaryMap.get(`${emp.id}_${periodKey}`) || null;
    setSelectedCell({
      employee: emp,
      periodNumber: monthNum,
      periodKey,
      salaryRecord: existing
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Controls: Year selector, active filter, and grand summary card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition"
              title={t("Previous Year", "Predchádzajúci rok", "Előző év")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-bold font-mono text-slate-800 dark:text-slate-100">
              {selectedYear}
            </span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition"
              title={t("Next Year", "Nasledujúci rok", "Következő év")}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="rounded text-[#c29b62] focus:ring-[#c29b62]"
            />
            <span>{t("Only Active Employees", "Len aktívni zamestnanci", "Csak aktív alkalmazottak")}</span>
          </label>
        </div>

        {/* Grand Total Badges */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {t("Total Planned Salaries", "Plánované mzdy", "Tervezett bérek")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
              {grandTotal.totalSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>

          <div className="px-3.5 py-1.5 rounded-xl bg-[#c29b62]/10 border border-[#c29b62]/30 text-right">
            <span className="text-[10px] uppercase font-bold text-[#b58b4c] dark:text-[#d4af7a] block tracking-wider">
              {t("Total Paid Out", "Vyplatené", "Kifizetve")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-[#9e7638] dark:text-[#d4af7a]">
              {grandTotal.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>
        </div>
      </div>

      {/* Main Salaries Matrix Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 min-w-[200px] border-r border-slate-200 dark:border-slate-700">
                  {t("Employee", "Zamestnanec", "Alkalmazott")}
                </th>
                {monthNames.map((mName, idx) => (
                  <th
                    key={idx}
                    className="py-3.5 px-2 text-center min-w-[100px] border-r border-slate-200/60 dark:border-slate-800/60"
                  >
                    <span>{mName}</span>
                  </th>
                ))}
                <th className="py-3.5 px-4 text-right min-w-[120px] bg-slate-50/90 dark:bg-slate-800/90 font-bold">
                  {t("Year Total", "Spolu Rok", "Év összesen")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
              {visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400">
                    {t("No employees found.", "Neboli nájdení žiadni zamestnanci.", "Nem találhatók alkalmazottak.")}
                  </td>
                </tr>
              ) : (
                visibleEmployees.map((emp) => {
                  let empYearSalary = 0;
                  let empYearPaid = 0;

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition group"
                    >
                      {/* Employee Fixed Name Column */}
                      <td className="py-3 px-4 sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 border-r border-slate-200 dark:border-slate-700 transition">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => onSelectEmployee && onSelectEmployee(emp.id)}
                            className="text-left font-semibold text-slate-900 dark:text-white hover:text-[#c29b62] dark:hover:text-[#d4af7a] transition truncate"
                          >
                            <span className="block truncate">{emp.name}</span>
                            <span className="text-[10px] font-normal text-slate-400 block">
                              {emp.pin || `${emp.salaryAmount} ${systemCurrency}/${emp.salaryType === "hourly" ? "h" : emp.salaryType === "daily" ? "d" : "m"}`}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* 12 Months Cells */}
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                        const pKey = `${selectedYear}-${String(mNum).padStart(2, "0")}`;
                        const sal = salaryMap.get(`${emp.id}_${pKey}`);

                        if (sal) {
                          empYearSalary += sal.totalSalary || 0;
                          empYearPaid += sal.totalPaid || 0;
                        }

                        const hasSalary = !!sal && sal.totalSalary > 0;
                        const isFullyPaid = hasSalary && (sal?.totalPaid || 0) >= (sal?.totalSalary || 0);
                        const isPartial = hasSalary && (sal?.totalPaid || 0) > 0 && !isFullyPaid;

                        return (
                          <td
                            key={mNum}
                            onClick={() => handleCellClick(emp, mNum)}
                            className="py-2.5 px-2 text-center border-r border-slate-100 dark:border-slate-800/60 cursor-pointer hover:bg-[#c29b62]/10 transition relative select-none"
                            title={t("Click to view or edit breakdown", "Kliknite pre detail a úpravu", "Kattintson a részletekért")}
                          >
                            {hasSalary ? (
                              <div
                                className={`py-1.5 px-1 rounded-lg border text-center transition ${
                                  isFullyPaid
                                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300"
                                    : isPartial
                                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300"
                                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <span className="block font-mono font-bold leading-tight">
                                  {Math.round(sal!.totalSalary).toLocaleString()}
                                </span>
                                <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px]">
                                  {isFullyPaid ? (
                                    <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                                      <Check className="w-3 h-3 stroke-[3]" />
                                    </span>
                                  ) : (
                                    <span className="font-mono text-[9px] opacity-75">
                                      {Math.round(sal!.totalPaid || 0)} {t("pd", "vyp", "kif")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 hover:text-slate-400 transition font-mono">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Year Row Total */}
                      <td className="py-3 px-4 text-right bg-slate-50/40 dark:bg-slate-800/40 font-mono font-bold text-slate-800 dark:text-slate-200">
                        <span className="block">
                          {empYearSalary.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                        </span>
                        <span className="text-[10px] font-normal text-[#9e7638] dark:text-[#d4af7a] block">
                          {t("Paid", "Vyp.", "Kif.")}: {empYearPaid.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Summary Footer Row */}
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-xs font-bold text-slate-900 dark:text-white">
                <td className="py-3.5 px-4 sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
                  {t("Total All Employees", "Celkom všetci", "Összes alkalmazott")}
                </td>
                {columnTotals.map((col, idx) => (
                  <td key={idx} className="py-3 px-1 text-center border-r border-slate-200/60 dark:border-slate-700 font-mono">
                    <span className="block text-slate-800 dark:text-slate-200">
                      {Math.round(col.totalSalary).toLocaleString()}
                    </span>
                    <span className="text-[9px] text-[#9e7638] dark:text-[#d4af7a] font-normal block">
                      {Math.round(col.totalPaid).toLocaleString()}
                    </span>
                  </td>
                ))}
                <td className="py-3.5 px-4 text-right font-mono text-sm text-[#9e7638] dark:text-[#d4af7a]">
                  {grandTotal.totalSalary.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* CELL EDIT DRAWER / MODAL */}
      {selectedCell && (
        <SalaryCellDrawer
          employee={selectedCell.employee}
          periodNumber={selectedCell.periodNumber}
          periodKey={selectedCell.periodKey}
          year={selectedYear}
          monthName={fullMonthNames[selectedCell.periodNumber - 1]}
          existingRecord={selectedCell.salaryRecord}
          settings={settings}
          onClose={() => setSelectedCell(null)}
          onSave={(saved) => {
            onSaveSalary(saved);
            setSelectedCell(null);
          }}
          systemLanguage={systemLanguage}
          systemCurrency={systemCurrency}
        />
      )}
    </div>
  );
};

/* --- INNER COMPONENT: SalaryCellDrawer --- */
interface SalaryCellDrawerProps {
  employee: Employee;
  periodNumber: number;
  periodKey: string;
  year: number;
  monthName: string;
  existingRecord: EmployeeSalary | null;
  settings: EmployeeSettings;
  onClose: () => void;
  onSave: (salary: EmployeeSalary) => void;
  systemLanguage?: string;
  systemCurrency?: string;
}

const SalaryCellDrawer: React.FC<SalaryCellDrawerProps> = ({
  employee,
  periodNumber,
  periodKey,
  year,
  monthName,
  existingRecord,
  settings,
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

    // Initialize from employee's default salary and categories
    return configuredCategories.map((cat, idx) => {
      // First category (base) gets employee's standard rate if not set
      const isBase = idx === 0 || cat.id === "base";
      const initialAmount = isBase && employee.salaryAmount ? employee.salaryAmount : cat.defaultAmount || 0;
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        amount: initialAmount,
        salary: initialAmount,
        paidAmount: 0,
        paid: 0
      };
    });
  });

  // Payout attributes
  const [dueDate, setDueDate] = useState<string>(() => {
    if (existingRecord?.dueDate) return existingRecord.dueDate;
    // Calculate default due date based on salaryDueDay
    const dueDay = employee.salaryDueDay || settings.salaryDueDay || 15;
    // Payout happens in following month
    const nextMonth = periodNumber === 12 ? 1 : periodNumber + 1;
    const nextYear = periodNumber === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(Math.min(dueDay, 28)).padStart(2, "0")}`;
  });

  const [paymentDate, setPaymentDate] = useState<string>(
    existingRecord?.paymentDate || new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(existingRecord?.paymentMethod || "bank_transfer");
  const [note, setNote] = useState<string>(existingRecord?.note || "");

  // Calculated totals
  const totalSalary = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  }, [items]);

  const totalPaid = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.paidAmount) || 0), 0);
  }, [items]);

  const balanceDue = Math.max(0, totalSalary - totalPaid);

  const handleItemChange = (idx: number, field: "amount" | "paidAmount", val: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  const handleMarkAllPaid = () => {
    const updated = items.map((it) => ({
      ...it,
      paidAmount: it.amount ?? 0,
      paid: it.amount ?? 0
    }));
    setItems(updated);
    setPaymentDate(new Date().toISOString().split("T")[0]);
  };

  const handleAddCustomCategory = () => {
    setItems([
      ...items,
      {
        categoryId: `custom_${Date.now()}`,
        categoryName: t("Extra Allowance", "Príplatok / Iné", "Külön juttatás"),
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
    let status: "pending" | "partially_paid" | "paid" = "pending";
    if (totalPaid >= totalSalary && totalSalary > 0) {
      status = "paid";
    } else if (totalPaid > 0) {
      status = "partially_paid";
    }

    const record: EmployeeSalary = {
      id: existingRecord?.id || `sal_${employee.id}_${periodKey}`,
      employeeId: employee.id,
      periodType: settings.salaryPeriod || "monthly",
      periodKey,
      year,
      periodNumber,
      items,
      totalSalary,
      totalPaid,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-[#c29b62]/10 dark:bg-[#c29b62]/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#c29b62] text-white flex items-center justify-center shadow-md shadow-[#c29b62]/30">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {employee.name} — {monthName} {year}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "Two-column salary breakdown: Salary (Due) and Paid amount",
                  "Dvojstĺpcový rozpis: Mzda (Predpis) a Vyplatená suma",
                  "Kétoszlopos bontás: Bér (Előírás) és Kifizetett összeg"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Mark as Paid Button */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  totalPaid >= totalSalary && totalSalary > 0
                    ? "bg-emerald-500"
                    : totalPaid > 0
                    ? "bg-amber-500"
                    : "bg-slate-400"
                }`}
              />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {totalPaid >= totalSalary && totalSalary > 0
                  ? t("Status: Fully Paid", "Stav: Vyplatené", "Állapot: Kifizetve")
                  : totalPaid > 0
                  ? t("Status: Partially Paid", "Stav: Čiastočne vyplatené", "Állapot: Részben kifizetve")
                  : t("Status: Planned / Unpaid", "Stav: Nevyplatené (Plánované)", "Állapot: Kifizetetlen (Tervezett)")}
              </span>
            </div>

            <button
              type="button"
              onClick={handleMarkAllPaid}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              {t("Mark as Fully Paid", "Označiť ako vyplatené", "Megjelölés kifizetettként")}
            </button>
          </div>

          {/* TWO-COLUMN SALARY CATEGORY TABLE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#b58b4c] dark:text-[#d4af7a]">
                {t("Salary Categories & Components", "Zložky mzdy", "Bérösszetevők")}
              </h4>
              <button
                type="button"
                onClick={handleAddCustomCategory}
                className="flex items-center gap-1 text-xs text-[#c29b62] hover:text-[#9e7638] font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("Add Row", "Pridať riadok", "Sor hozzáadása")}
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3 text-left">{t("Category", "Kategória", "Kategória")}</th>
                    <th className="py-2.5 px-3 text-right w-36 text-[#c29b62] font-bold">
                      {t("Salary (Due)", "Mzda (Predpis)", "Bér (Előírás)")}
                    </th>
                    <th className="py-2.5 px-3 text-right w-36 text-emerald-600 dark:text-emerald-400 font-bold">
                      {t("Paid", "Vyplatené", "Kifizetve")}
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.categoryName}
                          onChange={(e) => {
                            const updated = [...items];
                            updated[idx] = { ...updated[idx], categoryName: e.target.value };
                            setItems(updated);
                          }}
                          className="w-full bg-transparent border-0 p-0 text-slate-900 dark:text-white font-medium focus:ring-0 focus:outline-none"
                        />
                      </td>

                      {/* Salary Column */}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.amount}
                            onChange={(e) => handleItemChange(idx, "amount", parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-right bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
                          />
                          <span className="text-slate-400 text-[10px]">{systemCurrency}</span>
                        </div>
                      </td>

                      {/* Paid Column */}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.paidAmount}
                            onChange={(e) => handleItemChange(idx, "paidAmount", parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-right bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono text-emerald-600 dark:text-emerald-400 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-slate-400 text-[10px]">{systemCurrency}</span>
                        </div>
                      </td>

                      <td className="py-2 px-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-300 hover:text-red-500 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-xs">
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{t("Total", "Spolu", "Összesen")}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-900 dark:text-white">
                      {totalSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* DATES & PAYMENT DETAILS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("Due Date", "Dátum splatnosti", "Esedékesség dátuma")}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("Payment Date", "Dátum úhrady", "Kifizetés dátuma")}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("Payment Method", "Spôsob úhrady", "Fizetés módja")}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
              >
                <option value="bank_transfer">{t("Bank Transfer", "Bankový prevod", "Banki átutalás")}</option>
                <option value="cash">{t("Cash", "Hotovosť", "Készpénz")}</option>
                <option value="card">{t("Card", "Karta", "Bankkártya")}</option>
                <option value="other">{t("Other", "Iné", "Egyéb")}</option>
              </select>
            </div>
          </div>

          {/* NOTE */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t("Payout Note", "Poznámka k výplate", "Megjegyzés a kifizetéshez")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("e.g. Paid from Tatra banka account", "napr. Vyplatené z Tatra banky", "pl. Kifizetve a Tatra bank számláról")}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <div className="text-xs">
            <span className="text-slate-400">{t("Balance Remaining:", "Zostáva uhradiť:", "Fennmaradó összeg:")} </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#c29b62] hover:bg-[#b58b4c] rounded-xl shadow-md shadow-[#c29b62]/30 transition"
            >
              {t("Save Period Salary", "Uložiť mzdu", "Bér mentése")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalariesMatrixView;
