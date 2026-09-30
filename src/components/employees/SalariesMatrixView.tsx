import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  Clock
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings
} from "../../types";
import { SalaryCellDrawer } from "./SalaryCellDrawer";
import { formatNumber } from "../../utils/currency";

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
  const [displayMetric, setDisplayMetric] = useState<"paid" | "remaining">("paid");

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

  const totalRemaining = useMemo(() => {
    return Math.max(0, grandTotal.totalSalary - grandTotal.totalPaid);
  }, [grandTotal]);

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
      {/* Top Controls: Year selector, active filter, metric lightswitch, and grand summary card */}
      <div className="glass-panel rounded-2xl border border-white/60 dark:border-slate-800 bg-white/95 dark:bg-slate-900 shadow-glass p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/40 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer"
              title={t("Previous Year", "Predchádzajúci rok", "Előző év")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-bold font-mono text-slate-800 dark:text-slate-100">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer"
              title={t("Next Year", "Nasledujúci rok", "Következő év")}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="rounded text-[#c29b62] focus:ring-[#c29b62]"
            />
            <span>{t("Only Active Employees", "Len aktívni zamestnanci", "Csak aktív alkalmazottak")}</span>
          </label>

          {/* Metric Lightswitch: Paid vs Remaining */}
          <div
            role="radiogroup"
            aria-label={t("Filter display by paid or remaining", "Zobraziť vyplatené alebo zostávajúce", "Kifizetett vagy hátralék megjelenítése")}
            className="inline-flex items-center p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-inner"
          >
            <button
              type="button"
              role="radio"
              aria-checked={displayMetric === "paid"}
              onClick={() => setDisplayMetric("paid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                displayMetric === "paid"
                  ? "bg-white dark:bg-slate-700 text-[#9e7638] dark:text-[#d4af7a] shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t("Paid", "Vyplatené", "Kifizetve")}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={displayMetric === "remaining"}
              onClick={() => setDisplayMetric("remaining")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                displayMetric === "remaining"
                  ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>{t("Remaining", "Zostáva", "Hátralék")}</span>
            </button>
          </div>
        </div>

        {/* Grand Total Badges */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {t("Total Planned Salaries", "Plánované mzdy", "Tervezett bérek")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100">
              {formatNumber(grandTotal.totalSalary, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>

          <div
            onClick={() => setDisplayMetric("paid")}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer text-right ${
              displayMetric === "paid"
                ? "bg-[#c29b62]/15 border-2 border-[#c29b62] shadow-xs"
                : "bg-[#c29b62]/10 border border-[#c29b62]/30 opacity-80 hover:opacity-100"
            }`}
            title={t("Click to show paid amounts in table", "Kliknite pre zobrazenie vyplatených súm", "Kattintson a kifizetett összegek megjelenítéséhez")}
          >
            <span className="text-[10px] uppercase font-bold text-[#b58b4c] dark:text-[#d4af7a] block tracking-wider">
              {t("Total Paid Out", "Vyplatené", "Kifizetve")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-[#9e7638] dark:text-[#d4af7a]">
              {formatNumber(grandTotal.totalPaid, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>

          <div
            onClick={() => setDisplayMetric("remaining")}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer text-right ${
              displayMetric === "remaining"
                ? "bg-amber-500/15 border-2 border-amber-500 shadow-xs"
                : "bg-amber-500/10 border border-amber-500/30 opacity-80 hover:opacity-100"
            }`}
            title={t("Click to show remaining amounts in table", "Kliknite pre zobrazenie zostávajúcich súm", "Kattintson a hátralék megjelenítéséhez")}
          >
            <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block tracking-wider">
              {t("Total Remaining", "Zostáva vyplatiť", "Hátralék")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-amber-700 dark:text-amber-400">
              {formatNumber(totalRemaining, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>
        </div>
      </div>

      {/* Main Salaries Matrix Table */}
      <div className="glass-panel rounded-3xl border border-white/60 dark:border-slate-800 bg-white/95 dark:bg-slate-900 shadow-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 dark:bg-slate-800/60 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 min-w-[200px]">
                  {t("Employee", "Zamestnanec", "Alkalmazott")}
                </th>
                {monthNames.map((mName, idx) => (
                  <th
                    key={idx}
                    className="py-3.5 px-2 text-center min-w-[110px] border-r border-slate-200/60 dark:border-slate-700/60"
                  >
                    <span>{mName}</span>
                  </th>
                ))}
                <th className="py-3.5 px-4 text-right min-w-[140px] bg-slate-100/90 dark:bg-slate-800/90 font-bold">
                  <span>{t("Year Total", "Spolu Rok", "Év összesen")}</span>
                  <span className="block text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                    {displayMetric === "paid"
                      ? t("Plan / Paid", "Plán / Vyplatené", "Terv / Kifizetve")
                      : t("Plan / Remaining", "Plán / Zostáva", "Terv / Hátralék")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
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
                      className="hover:bg-slate-500/5 transition group"
                    >
                      {/* Employee Fixed Name Column */}
                      <td className="py-3 px-4 sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50/90 dark:group-hover:bg-slate-800/90 border-r border-slate-200 dark:border-slate-700 transition">
                        <div className="flex items-center justify-between">
                          <a
                            href={`#employees/${encodeURIComponent(emp.id)}`}
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectEmployee && onSelectEmployee(emp.id);
                            }}
                            className="text-left font-semibold text-slate-900 dark:text-slate-100 hover:text-[#c29b62] transition truncate cursor-pointer block"
                          >
                            <span className="block truncate">{emp.name}</span>
                            <span className="text-[10px] font-normal text-slate-400 block">
                              {emp.pin ? `${emp.pin} • ` : ""}{formatNumber(emp.salaryAmount || 0, systemLanguage)} {systemCurrency}/{emp.salaryType === "hourly" ? "h" : emp.salaryType === "daily" ? "d" : "m"}
                            </span>
                          </a>
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
                        const remaining = Math.max(0, (sal?.totalSalary || 0) - (sal?.totalPaid || 0));

                        return (
                          <td
                            key={mNum}
                            onClick={() => handleCellClick(emp, mNum)}
                            className="py-2.5 px-2 text-center border-r border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-[#c29b62]/10 transition relative select-none"
                            title={t("Click to view or edit breakdown", "Kliknite pre detail a úpravu", "Kattintson a részletekért")}
                          >
                            {hasSalary ? (
                              <div
                                className={`py-1.5 px-1 rounded-lg border text-center transition ${
                                  isFullyPaid
                                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                                    : isPartial
                                    ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300"
                                    : "bg-slate-100/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <span className="block font-mono font-bold leading-tight text-xs">
                                  {formatNumber(Math.round(sal!.totalSalary), systemLanguage)} {systemCurrency}
                                </span>
                                <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px]">
                                  {displayMetric === "paid" ? (
                                    isFullyPaid ? (
                                      <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-bold">
                                        <Check className="w-3 h-3 stroke-[3]" />
                                        <span>{formatNumber(Math.round(sal!.totalPaid || 0), systemLanguage)} {systemCurrency}</span>
                                      </span>
                                    ) : (
                                      <span className="font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                        {formatNumber(Math.round(sal!.totalPaid || 0), systemLanguage)} {systemCurrency} <span className="text-[9px] opacity-75">{t("pd", "vyp", "kif")}</span>
                                      </span>
                                    )
                                  ) : (
                                    isFullyPaid ? (
                                      <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-bold">
                                        <Check className="w-3 h-3 stroke-[3]" />
                                        <span>0 {systemCurrency}</span>
                                      </span>
                                    ) : (
                                      <span className="font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                        {formatNumber(Math.round(remaining), systemLanguage)} {systemCurrency} <span className="text-[9px] font-normal opacity-75">{t("rem", "zost", "hátr")}</span>
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 hover:text-slate-500 transition font-mono">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Year Row Total */}
                      <td className="py-3 px-4 text-right bg-slate-50/50 dark:bg-slate-800/40 font-mono font-bold text-slate-800 dark:text-slate-200">
                        <span className="block text-xs sm:text-sm">
                          {formatNumber(empYearSalary, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                        </span>
                        {displayMetric === "paid" ? (
                          <span className="text-[10px] font-semibold text-[#9e7638] dark:text-[#d4af7a] block mt-0.5">
                            {t("Paid", "Vyp.", "Kif.")}: {formatNumber(empYearPaid, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 block mt-0.5">
                            {t("Remaining", "Zost.", "Hátr.")}: {formatNumber(Math.max(0, empYearSalary - empYearPaid), systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Summary Footer Row */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 text-xs font-bold text-slate-900 dark:text-slate-100">
                <td className="py-3.5 px-4 sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
                  {t("Total All Employees", "Celkom všetci", "Összes alkalmazott")}
                </td>
                {columnTotals.map((col, idx) => (
                  <td key={idx} className="py-3 px-1 text-center border-r border-slate-200/60 dark:border-slate-700/60 font-mono">
                    <span className="block text-slate-800 dark:text-slate-200 font-bold text-xs">
                      {formatNumber(Math.round(col.totalSalary), systemLanguage)} {systemCurrency}
                    </span>
                    {displayMetric === "paid" ? (
                      <span className="text-[9px] text-[#9e7638] dark:text-[#d4af7a] font-semibold block mt-0.5">
                        {formatNumber(Math.round(col.totalPaid), systemLanguage)} {systemCurrency}
                      </span>
                    ) : (
                      <span className="text-[9px] text-amber-700 dark:text-amber-400 font-semibold block mt-0.5">
                        {formatNumber(Math.max(0, Math.round(col.totalSalary - col.totalPaid)), systemLanguage)} {systemCurrency}
                      </span>
                    )}
                  </td>
                ))}
                <td className="py-3.5 px-4 text-right font-mono">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    {formatNumber(grandTotal.totalSalary, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                  </span>
                  {displayMetric === "paid" ? (
                    <span className="text-xs text-[#9e7638] dark:text-[#d4af7a] font-bold block mt-0.5">
                      {t("Paid", "Vyp.", "Kif.")}: {formatNumber(grandTotal.totalPaid, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-400 font-bold block mt-0.5">
                      {t("Remaining", "Zost.", "Hátr.")}: {formatNumber(totalRemaining, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                    </span>
                  )}
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


export default SalariesMatrixView;
