import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
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
  Phone,
  Sparkles
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation
} from "../../types";
import { EmployeeTieIcon } from "../icons/EmployeeTieIcon";
import { formatNumber } from "../../utils/currency";

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
  onSeedMockData?: () => void;
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
  onOpenSettings: _onOpenSettings,
  onOpenMatrix: _onOpenMatrix,
  onSeedMockData,
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
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-lg:grid-cols-4 gap-4">
        {/* Total Staff */}
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-slate-400 block">
              {t("Total Staff", "Celkom zamestnancov", "Összes alkalmazott")}
            </span>
            <span className="type-metric text-slate-900 mt-1 block">
              {stats.total}
            </span>
            <span className="text-micro text-slate-400 font-medium">
              {stats.active} {t("active employees", "aktívnych", "aktív")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center shadow-xs">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Active Rate */}
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-slate-400 block">
              {t("Active Status", "Aktívny stav", "Aktív állapot")}
            </span>
            <span className="type-metric text-emerald-600 mt-1 block">
              {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
            </span>
            <span className="text-micro text-slate-400 font-medium">
              {stats.total - stats.active} {t("inactive / left", "neaktívnych", "inaktív")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Monthly Payroll Base */}
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-slate-400 block">
              {t("Est. Monthly Payroll", "Mesačný objem miezd", "Havi bérköltség")}
            </span>
            <span className="type-metric text-slate-900 mt-1 block">
              {formatNumber(stats.totalMonthlyPayroll, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{" "}
              <span className="text-body font-bold text-slate-400">{systemCurrency}</span>
            </span>
            <span className="text-micro text-slate-400 font-medium">
              {t("Due around", "Splatnosť okolo", "Esedékes:")} {settings.salaryDueDay ?? 15}. {t("of month", "v mesiaci", "")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center shadow-xs">
            <Coins className="w-6 h-6" />
          </div>
        </div>

        {/* On Leave Today */}
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-slate-400 block">
              {t("On Leave Today", "Dnes na dovolenke / PN", "Ma távol lévők")}
            </span>
            <span className="type-metric text-amber-600 mt-1 block">
              {stats.onLeaveToday}
            </span>
            <span className="text-micro text-slate-400 font-medium">
              {t("Absence calendar tracked", "Evidované v kalendári", "Naptárban rögzítve")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-2xl border border-white/60 bg-white/95 shadow-glass p-3 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Search by name, PIN, email or phone...", "Hľadať podľa mena, RČ, emailu...", "Keresés név, személyi szám szerint...")}
              className="w-full pl-9 pr-3.5 py-2 text-ui bg-slate-100/70 border border-slate-200/60 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#c29b62]/40 focus:bg-white transition"
            />
          </div>

          {/* Status Segmented Buttons */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl text-ui border border-slate-200/40">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 font-medium"
              }`}
            >
              {t("All", "Všetci", "Mind")}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                statusFilter === "active"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 font-medium"
              }`}
            >
              {t("Active", "Aktívni", "Aktív")}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                statusFilter === "inactive"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 font-medium"
              }`}
            >
              {t("Inactive", "Neaktívni", "Inaktív")}
            </button>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl text-slate-500 border border-slate-200/40">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              viewMode === "table" ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-800"
            }`}
            title={t("Table View", "Tabuľka", "Táblázat")}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              viewMode === "cards" ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-800"
            }`}
            title={t("Card View", "Karty", "Kártyák")}
          >
            <Grid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* EMPTY STATE */}
      {filteredEmployees.length === 0 ? (
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-[#c29b62]/15 text-[#9e7638] mx-auto flex items-center justify-center shadow-inner">
            <EmployeeTieIcon className="w-8 h-8" color="#c29b62" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-title-sm font-heading font-extrabold text-slate-900">
              {t("No employees found", "Žiadni zamestnanci", "Nincsenek alkalmazottak")}
            </h3>
            <p className="text-ui text-slate-500 leading-relaxed">
              {employees.length === 0
                ? t(
                    "Start by adding your first team member or quickly load sample employee profiles with salaries and vacations.",
                    "Začnite pridaním prvého zamestnanca alebo jedným klikom načítajte pripravené vzorové profily s platmi a dovolenkami.",
                    "Adja hozzá első alkalmazottját, vagy töltsön be minta profilokat bér- és szabadságadatokkal."
                  )
                : t("Try changing your search query or filter options.", "Skúste upraviť vyhľadávací dotaz alebo filter.", "Próbálja módosítani a keresési feltételeket.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {employees.length === 0 && onSeedMockData && (
              <button
                type="button"
                onClick={onSeedMockData}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-heading font-bold text-ui shadow-lg shadow-amber-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t("Load Demo Staff", "Naplniť vzorovými dátami", "Minta adatok betöltése")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onAddEmployee}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white font-heading font-bold text-ui shadow-lg shadow-[#c29b62]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t("Add Employee", "Nový zamestnanec", "Új alkalmazott")}</span>
            </button>
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-ui border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/75 text-slate-500 type-overline">
                  <th className="py-3.5 px-4">{t("Employee", "Zamestnanec", "Alkalmazott")}</th>
                  <th className="py-3.5 px-4">{t("Contact", "Kontakt", "Elérhetőség")}</th>
                  <th className="py-3.5 px-4">{t("Salary & Terms", "Mzda a podmienky", "Bér és feltételek")}</th>
                  <th className="py-3.5 px-4">{t("Time Tracking", "Meranie času", "Időkövetés")}</th>
                  <th className="py-3.5 px-4">{t("Contracts", "Zmluvy", "Szerződések")}</th>
                  <th className="py-3.5 px-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                  <th className="py-3.5 px-4 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
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
                      className="hover:bg-slate-500/5 cursor-pointer transition group"
                    >
                      {/* Employee Name & Role / PIN */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#c29b62]/20 to-[#9e7638]/20 border border-[#c29b62]/30 text-[#9e7638] flex items-center justify-center font-heading font-bold text-ui shrink-0 shadow-xs">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <a
                              href={`#employees/${encodeURIComponent(emp.id)}`}
                              onClick={(e) => {
                                e.preventDefault();
                                onSelectEmployee(emp.id);
                              }}
                              className="font-heading font-bold text-slate-900 block group-hover:text-[#c29b62] transition truncate text-body"
                            >
                              {emp.name}
                            </a>
                            <div className="flex items-center gap-2 mt-0.5">
                              {emp.role && (
                                <span className="text-caption font-medium text-slate-500 truncate block">
                                  {emp.role}
                                </span>
                              )}
                              {emp.pin && (
                                <span className="text-micro font-mono text-slate-400">
                                  • {emp.pin}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {emp.email && <div className="truncate font-medium">{emp.email}</div>}
                        {emp.phone && <div className="text-micro text-slate-400 mt-0.5">{emp.phone}</div>}
                      </td>

                      {/* Compensation */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 block text-ui">
                          {formatNumber(emp.salaryAmount, systemLanguage)} {systemCurrency}
                        </span>
                        <span className="text-micro text-slate-400 block mt-0.5">
                          {emp.salaryType === "hourly"
                            ? t("hourly", "hodinová", "órabér")
                            : emp.salaryType === "daily"
                            ? t("daily", "denná", "napibér")
                            : t("monthly", "mesačná", "havibér")}{" "}
                          • {t("Due", "Splatnosť", "Esedékes")}: {emp.salaryDueDay || (settings.salaryDueDay ?? 15)}.
                        </span>
                      </td>

                      {/* Time tracking mapping */}
                      <td className="py-3.5 px-4">
                        {emp.timeTrackingUserId ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-bold bg-[#c29b62]/10 text-[#9e7638] border border-[#c29b62]/25">
                            <Clock className="w-3 h-3 text-[#c29b62]" />
                            <span className="truncate max-w-30">{emp.timeTrackingUserName || emp.timeTrackingUserId}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-micro">—</span>
                        )}
                      </td>

                      {/* Contracts count */}
                      <td className="py-3.5 px-4">
                        {emp.files && emp.files.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-caption text-slate-700 font-semibold">
                            <FileText className="w-3.5 h-3.5 text-[#c29b62]" />
                            <span>{emp.files.length}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-micro">0</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full type-overline ${
                            emp.isActive !== false
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.isActive !== false ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                          {emp.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => onEditEmployee(emp)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title={t("Edit", "Upraviť", "Szerkesztés")}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEmployee(emp.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                            title={t("Delete", "Zmazať", "Törlés")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition ml-1" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-lg:grid-cols-3 gap-5">
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
                className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between space-y-4 group cursor-pointer relative"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#c29b62]/20 to-[#9e7638]/20 border border-[#c29b62]/30 text-[#9e7638] flex items-center justify-center font-heading font-bold text-body shrink-0 shadow-xs">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <a
                          href={`#employees/${encodeURIComponent(emp.id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            onSelectEmployee(emp.id);
                          }}
                          className="font-heading font-bold text-body text-slate-900 group-hover:text-[#c29b62] transition truncate block"
                        >
                          {emp.name}
                        </a>
                        {emp.role ? (
                          <span className="text-caption font-medium text-slate-500 truncate block">
                            {emp.role}
                          </span>
                        ) : emp.pin ? (
                          <span className="text-micro font-mono text-slate-400 block">{emp.pin}</span>
                        ) : (
                          <span className="text-micro text-slate-400 block">{emp.addressCity || "—"}</span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full type-overline shrink-0 ${
                        emp.isActive !== false
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${emp.isActive !== false ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {emp.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-ui text-slate-600">
                    {emp.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate font-medium">{emp.email}</span>
                      </div>
                    )}
                    {emp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-500">{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-ui">
                  <div>
                    <span className="font-mono font-bold text-slate-900 block text-body">
                      {formatNumber(emp.salaryAmount, systemLanguage)} {systemCurrency}
                    </span>
                    <span className="text-micro text-slate-400 font-medium">
                      {emp.salaryType === "hourly"
                        ? t("hourly", "hodinová", "órabér")
                        : emp.salaryType === "daily"
                        ? t("daily", "denná", "napibér")
                        : t("monthly", "mesačná", "havibér")}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onEditEmployee(emp)}
                      className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                      title={t("Edit", "Upraviť", "Szerkesztés")}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteEmployee(emp.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
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
