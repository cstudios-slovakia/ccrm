import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings
} from "../../types";
import { SalaryCellDrawer } from "./SalaryCellDrawer";

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
      <div className="glass-panel rounded-2xl border border-white/60 bg-white/95 shadow-glass p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/40">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition cursor-pointer"
              title={t("Previous Year", "Predchádzajúci rok", "Előző év")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-bold font-mono text-slate-800">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition cursor-pointer"
              title={t("Next Year", "Nasledujúci rok", "Következő év")}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
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
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200/60 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {t("Total Planned Salaries", "Plánované mzdy", "Tervezett bérek")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-slate-800">
              {grandTotal.totalSalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>

          <div className="px-3.5 py-1.5 rounded-xl bg-[#c29b62]/10 border border-[#c29b62]/30 text-right">
            <span className="text-[10px] uppercase font-bold text-[#b58b4c] block tracking-wider">
              {t("Total Paid Out", "Vyplatené", "Kifizetve")} ({selectedYear})
            </span>
            <span className="text-sm font-bold font-mono text-[#9e7638]">
              {grandTotal.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>
        </div>
      </div>

      {/* Main Salaries Matrix Table */}
      <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 sticky left-0 z-20 bg-slate-100 border-r border-slate-200 min-w-[200px]">
                  {t("Employee", "Zamestnanec", "Alkalmazott")}
                </th>
                {monthNames.map((mName, idx) => (
                  <th
                    key={idx}
                    className="py-3.5 px-2 text-center min-w-[100px] border-r border-slate-200/60"
                  >
                    <span>{mName}</span>
                  </th>
                ))}
                <th className="py-3.5 px-4 text-right min-w-[120px] bg-slate-100/90 font-bold">
                  {t("Year Total", "Spolu Rok", "Év összesen")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
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
                      <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-slate-50/90 border-r border-slate-200 transition">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => onSelectEmployee && onSelectEmployee(emp.id)}
                            className="text-left font-semibold text-slate-900 hover:text-[#c29b62] transition truncate cursor-pointer"
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
                            className="py-2.5 px-2 text-center border-r border-slate-100 cursor-pointer hover:bg-[#c29b62]/10 transition relative select-none"
                            title={t("Click to view or edit breakdown", "Kliknite pre detail a úpravu", "Kattintson a részletekért")}
                          >
                            {hasSalary ? (
                              <div
                                className={`py-1.5 px-1 rounded-lg border text-center transition ${
                                  isFullyPaid
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : isPartial
                                    ? "bg-amber-50 border-amber-200 text-amber-800"
                                    : "bg-slate-100/70 border-slate-200 text-slate-700"
                                }`}
                              >
                                <span className="block font-mono font-bold leading-tight">
                                  {Math.round(sal!.totalSalary).toLocaleString()}
                                </span>
                                <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px]">
                                  {isFullyPaid ? (
                                    <span className="flex items-center text-emerald-600">
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
                              <span className="text-slate-300 hover:text-slate-500 transition font-mono">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Year Row Total */}
                      <td className="py-3 px-4 text-right bg-slate-50/50 font-mono font-bold text-slate-800">
                        <span className="block">
                          {empYearSalary.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {systemCurrency}
                        </span>
                        <span className="text-[10px] font-normal text-[#9e7638] block">
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
              <tr className="border-t-2 border-slate-200 bg-slate-100/90 text-xs font-bold text-slate-900">
                <td className="py-3.5 px-4 sticky left-0 z-20 bg-slate-100 border-r border-slate-200">
                  {t("Total All Employees", "Celkom všetci", "Összes alkalmazott")}
                </td>
                {columnTotals.map((col, idx) => (
                  <td key={idx} className="py-3 px-1 text-center border-r border-slate-200/60 font-mono">
                    <span className="block text-slate-800">
                      {Math.round(col.totalSalary).toLocaleString()}
                    </span>
                    <span className="text-[9px] text-[#9e7638] font-normal block">
                      {Math.round(col.totalPaid).toLocaleString()}
                    </span>
                  </td>
                ))}
                <td className="py-3.5 px-4 text-right font-mono text-sm text-[#9e7638]">
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


export default SalariesMatrixView;
