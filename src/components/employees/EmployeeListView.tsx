import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Settings,
  Users,
  UserCheck,
  Coins,
  Calendar,
  Grid,
  List,
  Edit3,
  Trash2,
  ChevronRight,
  Clock,
  FileText,
  Mail,
  Phone
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation
} from "../../types";
import { EmployeeTieIcon } from "../icons/EmployeeTieIcon";

interface EmployeeListViewProps {
  employees: Employee[];
  salaries: EmployeeSalary[];
  vacations: EmployeeVacation[];
  settings: EmployeeSettings;
  onSelectEmployee: (employeeId: string) => void;
  onAddEmployee: () => void;
  onEditEmployee: (employee: Employee) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onOpenSettings: () => void;
  onOpenMatrix: () => void;
  systemLanguage?: string;
  systemCurrency?: string;
}

export const EmployeeListView: React.FC<EmployeeListViewProps> = ({
  employees,
  salaries: _salaries,
  vacations,
  settings,
  onSelectEmployee,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee,
  onOpenSettings,
  onOpenMatrix,
  systemLanguage = "sk",
  systemCurrency = "€"
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.isActive !== false).length;

    // Monthly payroll sum
    const totalMonthlyPayroll = employees
      .filter((e) => e.isActive !== false)
      .reduce((sum, e) => {
        if (e.salaryType === "monthly") return sum + (e.salaryAmount || 0);
        if (e.salaryType === "daily") return sum + (e.salaryAmount || 0) * 21;
        if (e.salaryType === "hourly") return sum + (e.salaryAmount || 0) * 168;
        return sum + (e.salaryAmount || 0);
      }, 0);

    // Employees on leave today
    const todayStr = new Date().toISOString().split("T")[0];
    const onLeaveToday = employees.filter((emp) => {
      return vacations.some((v) => {
        if (v.employeeId !== emp.id) return false;
        if (v.status === "rejected") return false;
        return todayStr >= v.startDate && todayStr <= v.endDate;
      });
    }).length;

    return { total, active, totalMonthlyPayroll, onLeaveToday };
  }, [employees, vacations]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Status filter
      if (statusFilter === "active" && emp.isActive === false) return false;
      if (statusFilter === "inactive" && emp.isActive !== false) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = emp.name.toLowerCase().includes(q);
        const matchesEmail = (emp.email || "").toLowerCase().includes(q);
        const matchesPin = (emp.pin || "").toLowerCase().includes(q);
        const matchesPhone = (emp.phone || "").toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPin && !matchesPhone) return false;
      }

      return true;
    });
  }, [employees, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#c29b62] text-white flex items-center justify-center shadow-md shadow-[#c29b62]/30">
              <EmployeeTieIcon className="w-5 h-5" color="#ffffff" />
            </div>
            <span>{t("Employees & Payroll", "Zamestnanci a mzdy", "Alkalmazottak és bérek")}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              "Staff directory, salary structures, Toggl time tracking & vacation planner",
              "Prehľad zamestnancov, štruktúra miezd, meranie času a plánovač dovoleniek",
              "Munkatársak, bérstruktúra, időkövetés és szabadságtervező"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenMatrix}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm"
          >
            <Coins className="w-4 h-4 text-[#c29b62]" />
            <span>{t("Salaries Matrix", "Matica miezd", "Bérmátrix")}</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition shadow-sm"
            title={t("Settings", "Nastavenia", "Beállítások")}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={onAddEmployee}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#c29b62] text-white hover:bg-[#b58b4c] transition shadow-md shadow-[#c29b62]/30"
          >
            <Plus className="w-4 h-4" />
            <span>{t("Add Employee", "Nový zamestnanec", "Új alkalmazott")}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row with Sand Theme Accents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Staff */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              {t("Total Staff", "Celkom zamestnancov", "Összes alkalmazott")}
            </span>
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
              {stats.total}
            </span>
            <span className="text-[10px] text-slate-400">
              {stats.active} {t("active employees", "aktívnych", "aktív")}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#c29b62]/10 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Active Rate */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              {t("Active Status", "Aktívny stav", "Aktív állapot")}
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
            </span>
            <span className="text-[10px] text-slate-400">
              {stats.total - stats.active} {t("inactive / left", "neaktívnych", "inaktív")}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Monthly Payroll Base */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              {t("Est. Monthly Payroll", "Mesačný objem miezd", "Havi bérköltség")}
            </span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
              {stats.totalMonthlyPayroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{" "}
              {systemCurrency}
            </span>
            <span className="text-[10px] text-slate-400">
              {t("Due around", "Splatnosť okolo", "Esedékes:")} {settings.salaryDueDay ?? 15}. {t("of month", "v mesiaci", "")}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#c29b62]/10 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* On Leave Today */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              {t("On Leave Today", "Dnes na dovolenke / PN", "Ma távol lévők")}
            </span>
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5 block">
              {stats.onLeaveToday}
            </span>
            <span className="text-[10px] text-slate-400">
              {t("Absence calendar tracked", "Evidované v kalendári", "Naptárban rögzítve")}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Search by name, PIN, email or phone...", "Hľadať podľa mena, RČ, emailu...", "Keresés név, személyi szám szerint...")}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
            />
          </div>

          {/* Status Segmented Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                statusFilter === "all"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {t("All", "Všetci", "Mind")}
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                statusFilter === "active"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {t("Active", "Aktívni", "Aktív")}
            </button>
            <button
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                statusFilter === "inactive"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {t("Inactive", "Neaktívni", "Inaktív")}
            </button>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-slate-500">
          <button
            onClick={() => setViewMode("table")}
            className={`p-1.5 rounded-lg transition ${
              viewMode === "table" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : ""
            }`}
            title={t("Table View", "Tabuľka", "Táblázat")}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`p-1.5 rounded-lg transition ${
              viewMode === "cards" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : ""
            }`}
            title={t("Card View", "Karty", "Kártyák")}
          >
            <Grid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TABLE VIEW */}
      {viewMode === "table" ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">{t("Employee", "Zamestnanec", "Alkalmazott")}</th>
                  <th className="py-3 px-4">{t("Contact", "Kontakt", "Elérhetőség")}</th>
                  <th className="py-3 px-4">{t("Salary & Terms", "Mzda a podmienky", "Bér és feltételek")}</th>
                  <th className="py-3 px-4">{t("Time Tracking", "Meranie času", "Időkövetés")}</th>
                  <th className="py-3 px-4">{t("Contracts", "Zmluvy", "Szerződések")}</th>
                  <th className="py-3 px-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                  <th className="py-3 px-4 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      {t("No employees found.", "Neboli nájdení žiadni zamestnanci.", "Nem található alkalmazott.")}
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const initials = emp.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();

                    return (
                      <tr
                        key={emp.id}
                        onClick={() => onSelectEmployee(emp.id)}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition group"
                      >
                        {/* Employee Name & PIN */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#c29b62]/15 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center font-bold text-xs shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-900 dark:text-white block group-hover:text-[#c29b62] transition truncate">
                                {emp.name}
                              </span>
                              {emp.pin ? (
                                <span className="text-[10px] font-mono text-slate-400 block">{emp.pin}</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 block">{emp.addressCity || "—"}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {emp.email && <div className="truncate">{emp.email}</div>}
                          {emp.phone && <div className="text-[10px] text-slate-400">{emp.phone}</div>}
                        </td>

                        {/* Compensation */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white block">
                            {(emp.salaryAmount || 0).toLocaleString()} {systemCurrency}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {emp.salaryType === "hourly"
                              ? t("hourly", "hodinová", "órabér")
                              : emp.salaryType === "daily"
                              ? t("daily", "denná", "napibér")
                              : t("monthly", "mesačná", "havibér")}{" "}
                            • {t("Due", "Splatnosť", "Esedékes")}: {emp.salaryDueDay || (settings.salaryDueDay ?? 15)}.
                          </span>
                        </td>

                        {/* Time tracking mapping */}
                        <td className="py-3 px-4">
                          {emp.timeTrackingUserId ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#c29b62]/10 text-[#9e7638] dark:text-[#d4af7a] border border-[#c29b62]/20">
                              <Clock className="w-3 h-3" />
                              <span>{emp.timeTrackingUserName || emp.timeTrackingUserId}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">—</span>
                          )}
                        </td>

                        {/* Contracts count */}
                        <td className="py-3 px-4">
                          {emp.files && emp.files.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                              <FileText className="w-3.5 h-3.5 text-[#c29b62]" />
                              <span>{emp.files.length}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">0</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              emp.isActive !== false
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {emp.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => onEditEmployee(emp)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title={t("Edit", "Upraviť", "Szerkesztés")}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteEmployee(emp.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                              title={t("Delete", "Zmazať", "Törlés")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition ml-1" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => {
            const initials = emp.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp.id)}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#c29b62]/15 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center font-bold text-sm shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-[#c29b62] transition truncate">
                          {emp.name}
                        </h3>
                        {emp.pin ? (
                          <span className="text-[10px] font-mono text-slate-400 block">{emp.pin}</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 block">{emp.addressCity || "—"}</span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        emp.isActive !== false
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {emp.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    {emp.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                    )}
                    {emp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white block">
                      {(emp.salaryAmount || 0).toLocaleString()} {systemCurrency}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {emp.salaryType === "hourly"
                        ? t("hourly", "hodinová", "órabér")
                        : emp.salaryType === "daily"
                        ? t("daily", "denná", "napibér")
                        : t("monthly", "mesačná", "havibér")}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onEditEmployee(emp)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title={t("Edit", "Upraviť", "Szerkesztés")}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteEmployee(emp.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      title={t("Delete", "Zmazať", "Törlés")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EmployeeListView;
