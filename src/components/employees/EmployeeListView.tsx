import { StatGrid } from "../layout";
import { SectionIcon } from "../icons/SectionIcon";
import { SECTION_VISUALS } from "../../utils/sectionVisuals";
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Plus,
  Users,
  UserCheck,
  Coins,
  Calendar,
  Grid,
  List,
  ListTree,
  Move,
  Edit3,
  Trash2,
  ChevronRight,
  Clock,
  FileText,
  Mail,
  Phone,
  Sparkles,
  Brain,
  RefreshCw
} from "lucide-react";
import { hasAiConfigured } from "../../utils/aiConfig";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation
} from "../../types";
import { formatNumber } from "../../utils/currency";
import { employeeKind, needsFullName, type EmployeeKind } from "../../utils/employeeIdentity";
import { useUserPref } from "../../utils/userPrefs";
import { applyManualOrder, newestFirst } from "../../utils/projectSort";
import { moveRelative, type DropPosition } from "../../utils/reorder";
import { useDragReorder } from "../../hooks/useDragReorder";
import { useDragAutoScroll } from "../../hooks/useDragAutoScroll";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { asLang } from "../../utils/undoMessages";
import { FULL_EMPLOYEE_RIGHTS, type EmployeeRights } from "../../utils/employeeRights";
import { StickyHScrollbar } from "../ui/StickyHScrollbar";
import { useStickyTableHead } from "../../hooks/useStickyTableHead";
import { useListFilter } from "../../hooks/useListFilter";

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
  /** Demo installs: where the demo data is re-seeded (Settings › Re-seed demo data). Shown on the empty state. */
  reseedHref?: string;
  systemLanguage?: string;
  systemCurrency?: string;
  /** What this person may see and change; the server sends nothing beyond it. */
  rights?: EmployeeRights;
  integrationsConfig?: any;
}

export const EmployeeListView: React.FC<EmployeeListViewProps> = ({
  employees,
  salaries,
  vacations,
  settings,
  onSelectEmployee,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee,
  onOpenSettings: _onOpenSettings,
  onOpenMatrix: _onOpenMatrix,
  reseedHref,
  systemLanguage = "sk",
  systemCurrency = "€",
  rights = FULL_EMPLOYEE_RIGHTS,
  integrationsConfig
}) => {
  const [tableWrapRef, tableWrapEl] = useStickyTableHead();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useListFilter<"all" | "active" | "inactive">("employees.status", "all");
  const [kindFilter, setKindFilter] = useListFilter<"all" | EmployeeKind>("employees.kind", "all");
  /* The structure, a plain table or cards. DB-backed like the projects list's, so
     the choice follows the user to their next device. The structure is a table
     that always shows the hand-set order and is rearranged by dragging. */
  const [viewMode, setViewMode] = useUserPref("employeesViewMode");
  const [employeesOrder, setEmployeesOrder] = useUserPref("employeesOrder");
  const isStructure = viewMode === "structure";

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

  // Roster-wide deterministic problems & AI summary
  const rosterProblems = useMemo(() => {
    const probs: string[] = [];
    const activeEmps = employees.filter((e) => e.isActive !== false && employeeKind(e) === "employee");
    const unpaidSalCount = salaries.filter((s) => s.status !== "paid").length;
    if (unpaidSalCount > 0) {
      probs.push(
        t(
          `${unpaidSalCount} unpaid salary record(s) across the team`,
          `${unpaidSalCount} neuhradená mzda / záznam v tíme`,
          `${unpaidSalCount} kifizetetlen bérrekord a csapatban`
        )
      );
    }
    const missingContracts = activeEmps.filter((e) => (e.files || []).length === 0);
    if (missingContracts.length > 0) {
      probs.push(
        t(
          `${missingContracts.length} active employee(s) missing uploaded contract (${missingContracts.slice(0, 3).map((e) => e.name).join(", ")}${missingContracts.length > 3 ? "…" : ""})`,
          `${missingContracts.length} aktívny zamestnanec bez nahranej zmluvy (${missingContracts.slice(0, 3).map((e) => e.name).join(", ")}${missingContracts.length > 3 ? "…" : ""})`,
          `${missingContracts.length} aktív alkalmazott feltöltött szerződés nélkül (${missingContracts.slice(0, 3).map((e) => e.name).join(", ")}${missingContracts.length > 3 ? "…" : ""})`
        )
      );
    }
    const pendingVacs = vacations.filter((v) => v.status === "pending");
    if (pendingVacs.length > 0) {
      probs.push(
        t(
          `${pendingVacs.length} pending vacation/absence request(s) awaiting approval`,
          `${pendingVacs.length} čakajúca žiadosť o dovolenku/absenciu`,
          `${pendingVacs.length} jóváhagyásra váró szabadságkérelem`
        )
      );
    }
    const missingContacts = activeEmps.filter((e) => !e.email && !e.phone);
    if (missingContacts.length > 0) {
      probs.push(
        t(
          `${missingContacts.length} active employee(s) missing email & phone`,
          `${missingContacts.length} aktívny zamestnanec bez e-mailu a telefónu`,
          `${missingContacts.length} aktív alkalmazott e-mail és telefon nélkül`
        )
      );
    }
    return probs;
  }, [employees, salaries, vacations, systemLanguage]);

  const rosterFp = useMemo(() => {
    const unpaidSalCount = salaries.filter((s) => s.status !== "paid").length;
    const pendingVacs = vacations.filter((v) => v.status === "pending").length;
    return `${employees.length}|${stats.active}|${unpaidSalCount}|${pendingVacs}|${rosterProblems.join(";")}|${systemLanguage}`;
  }, [employees.length, stats.active, salaries, vacations, rosterProblems, systemLanguage]);

  const [rosterAiSummary, setRosterAiSummary] = useState<string>("");
  const [rosterAiProblems, setRosterAiProblems] = useState<string[]>([]);
  const [isGeneratingRosterSummary, setIsGeneratingRosterSummary] = useState<boolean>(false);

  const generateRosterSummary = React.useCallback(
    async (force = false) => {
      if (employees.length === 0) return;
      const storageKey = "ccrm_ai_sum_emp_roster";
      if (!force && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.fp === rosterFp && parsed.summary) {
              setRosterAiSummary(parsed.summary);
              setRosterAiProblems(Array.isArray(parsed.problems) ? parsed.problems : []);
              return;
            }
          }
        } catch {}
      }
      if (!hasAiConfigured(integrationsConfig)) return;
      setIsGeneratingRosterSummary(true);
      try {
        const res = await fetchWithTimeout(
          "/api/summarize_client_lead.php",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Employees Roster",
              type: "employees team",
              systemLanguage,
              tasks: [],
              events: [],
              priceOffers: [],
              otherData: {
                totalEmployees: stats.total,
                activeEmployees: stats.active,
                monthlyPayroll: stats.totalMonthlyPayroll,
                onLeaveToday: stats.onLeaveToday,
                unpaidSalariesCount: salaries.filter((s) => s.status !== "paid").length,
                pendingVacationsCount: vacations.filter((v) => v.status === "pending").length,
                detectedProblems: rosterProblems,
              },
            }),
          },
          25_000
        );
        const data = await res.json();
        if (data.success && data.summary) {
          const probs = Array.isArray(data.problems) ? data.problems.filter(Boolean) : [];
          setRosterAiSummary(data.summary);
          setRosterAiProblems(probs);
          try {
            localStorage.setItem(storageKey, JSON.stringify({ fp: rosterFp, summary: data.summary, problems: probs }));
          } catch {}
        }
      } catch (err) {
        console.error("Failed to generate employees roster AI summary:", err);
      } finally {
        setIsGeneratingRosterSummary(false);
      }
    },
    [employees.length, stats, salaries, vacations, rosterProblems, rosterFp, integrationsConfig, systemLanguage]
  );

  useEffect(() => {
    generateRosterSummary(false);
  }, [generateRosterSummary]);

  const combinedRosterProblems = useMemo(() => {
    const merged = [...rosterAiProblems];
    for (const p of rosterProblems) {
      if (!merged.some((e) => e.toLowerCase().includes(p.slice(0, 18).toLowerCase()))) {
        merged.push(p);
      }
    }
    return merged;
  }, [rosterAiProblems, rosterProblems]);

  const kindLabels: Record<EmployeeKind, string> = {
    employee: t("Employees", "Zamestnanci", "Alkalmazottak"),
    contractor: t("Suppliers", "Dodávatelia", "Beszállítók"),
    ledger: t("Accounting items", "Účtovné položky", "Könyvelési tételek"),
  };
  /* The kind filter only appears once the roster holds something besides people. */
  const hasOtherKinds = useMemo(() => employees.some((e) => employeeKind(e) !== "employee"), [employees]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Status filter
      if (statusFilter === "active" && emp.isActive === false) return false;
      if (statusFilter === "inactive" && emp.isActive !== false) return false;
      if (kindFilter !== "all" && employeeKind(emp) !== kindFilter) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = [emp.name, emp.position, emp.department].some((v) => (v || "").toLowerCase().includes(q));
        const matchesEmail = (emp.email || "").toLowerCase().includes(q);
        const matchesPin = (emp.pin || "").toLowerCase().includes(q);
        const matchesPhone = (emp.phone || "").toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPin && !matchesPhone) return false;
      }

      return true;
    });
  }, [employees, statusFilter, kindFilter, searchQuery]);

  /* Every employee in the structure: the hand-set order. Anyone it has never
     seen (added since the last drag) sits on top, like a new project does. */
  const structureEmployees = useMemo(
    () => applyManualOrder(newestFirst(employees), employeesOrder),
    [employees, employeesOrder]
  );

  /* What the table and cards show: the filtered list, in the structure's order
     when that view is on. */
  const shownEmployees = useMemo(() => {
    if (!isStructure) return filteredEmployees;
    const visible = new Set(filteredEmployees.map((e) => e.id));
    return structureEmployees.filter((e) => visible.has(e.id));
  }, [isStructure, filteredEmployees, structureEmployees]);

  /* Drag a row onto another to put it there. The whole structure is moved, not
     just the filtered rows, so a drop made while the list is filtered leaves the
     hidden employees where they were. */
  const handleEmployeeMove = (dragId: string, targetId: string, position: DropPosition) => {
    setEmployeesOrder(moveRelative(structureEmployees.map((e) => e.id), (id) => id, dragId, targetId, position));
  };
  const employeeDrag = useDragReorder({
    enabled: isStructure,
    onMove: handleEmployeeMove
  });

  // A long list scrolls under the pointer while a row is dragged near an edge.
  const resultsRef = useRef<HTMLDivElement | null>(null);
  useDragAutoScroll(employeeDrag.draggedId !== null, resultsRef);

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <StatGrid count={4}>
        {/* Total Staff */}
        <div className=" rounded-lg border border-gray-200 bg-white shadow-xs p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-gray-400 block">
              {t("Total Staff", "Celkom zamestnancov", "Összes alkalmazott")}
            </span>
            <span className="type-metric text-gray-900 mt-1 block">
              {stats.total}
            </span>
            <span className="text-micro text-gray-400 font-medium">
              {stats.active} {t("active employees", "aktívnych", "aktív")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-entity-subtle text-[#9e7638] flex items-center justify-center shadow-xs">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Active Rate */}
        <div className=" rounded-lg border border-gray-200 bg-white shadow-xs p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-gray-400 block">
              {t("Active Status", "Aktívny stav", "Aktív állapot")}
            </span>
            <span className="type-metric text-emerald-600 mt-1 block">
              {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
            </span>
            <span className="text-micro text-gray-400 font-medium">
              {stats.total - stats.active} {t("inactive / left", "neaktívnych", "inaktív")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Monthly Payroll Base */}
        {rights.salaries && (
        <div className=" rounded-lg border border-gray-200 bg-white shadow-xs p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-gray-400 block">
              {t("Est. Monthly Payroll", "Mesačný objem miezd", "Havi bérköltség")}
            </span>
            <span className="type-metric text-gray-900 mt-1 block">
              {formatNumber(stats.totalMonthlyPayroll, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{" "}
              <span className="text-body font-bold text-gray-400">{systemCurrency}</span>
            </span>
            <span className="text-micro text-gray-400 font-medium">
              {t("Due around", "Splatnosť okolo", "Esedékes:")} {settings.salaryDueDay ?? 15}. {t("of month", "v mesiaci", "a hónapban")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-entity-subtle text-[#9e7638] flex items-center justify-center shadow-xs">
            <Coins className="w-6 h-6" />
          </div>
        </div>
        )}

        {/* On Leave Today */}
        {rights.vacations && (
        <div className=" rounded-lg border border-gray-200 bg-white shadow-xs p-5 flex items-center justify-between hover:shadow-lg transition-all">
          <div>
            <span className="type-overline text-gray-400 block">
              {t("On Leave Today", "Dnes na dovolenke / PN", "Ma távol lévők")}
            </span>
            <span className="type-metric text-amber-600 mt-1 block">
              {stats.onLeaveToday}
            </span>
            <span className="text-micro text-gray-400 font-medium">
              {t("Absence calendar tracked", "Evidované v kalendári", "Naptárban rögzítve")}
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
        )}
      </StatGrid>

      {/* AI Roster Summary & Problem Highlighting Banner */}
      {employees.length > 0 && (
        <div
          data-testid="employees-list-ai-summary"
          className={`rounded-lg border px-4 py-3 shadow-xs transition-colors ${
            combinedRosterProblems.length > 0
              ? "bg-rose-50/70 border-rose-200/80"
              : "bg-amber-50/40 border-entity-border"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Brain
                className={`size-4 shrink-0 ${
                  combinedRosterProblems.length > 0 ? "text-rose-600" : "text-[#9e7638]"
                } ${isGeneratingRosterSummary ? "animate-pulse" : ""}`}
              />
              <span
                className={`text-micro font-bold uppercase tracking-wider ${
                  combinedRosterProblems.length > 0 ? "text-rose-700" : "text-[#9e7638]"
                }`}
              >
                {t("AI Team Summary & Problem Highlights", "AI Zhrnutie tímu a zistené problémy", "AI Csapatösszefoglaló és Problémák")}
              </span>
              {combinedRosterProblems.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  ⚠️ {combinedRosterProblems.length} {t("problem(s)", "problém(y)", "probléma")}
                </span>
              )}
            </div>
            {hasAiConfigured(integrationsConfig) && (
              <button
                type="button"
                onClick={() => generateRosterSummary(true)}
                disabled={isGeneratingRosterSummary}
                className="p-1 rounded-lg hover:bg-white text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                title={t("Regenerate AI Summary", "Pregenerovať AI zhrnutie", "AI összefoglaló újragenerálása")}
              >
                <RefreshCw className={`size-3.5 ${isGeneratingRosterSummary ? "animate-spin text-[#9e7638]" : ""}`} />
              </button>
            )}
          </div>
          {combinedRosterProblems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {combinedRosterProblems.map((prob, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/90 border border-rose-200 text-rose-800 text-caption font-semibold"
                >
                  <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
                  {prob}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-caption text-gray-700 leading-relaxed">
            {isGeneratingRosterSummary && !rosterAiSummary ? (
              <span className="italic text-gray-400">
                {t("Generating AI team overview...", "Generujem AI prehľad tímu...", "AI csapatáttekintés generálása...")}
              </span>
            ) : rosterAiSummary ? (
              rosterAiSummary
            ) : combinedRosterProblems.length > 0 ? (
              t(
                `Team overview: ${stats.active}/${stats.total} active employees. Issues highlighted above require attention.`,
                `Prehľad tímu: ${stats.active}/${stats.total} aktívnych zamestnancov. Vyššie uvedené problémy vyžadujú pozornosť.`,
                `Csapat áttekintés: ${stats.active}/${stats.total} aktív alkalmazott. A fenti problémák figyelmet igényelnek.`
              )
            ) : (
              t(
                `Team overview: ${stats.active}/${stats.total} active employees. All contracts, contacts, and payroll records are up to date.`,
                `Prehľad tímu: ${stats.active}/${stats.total} aktívnych zamestnancov. Všetky zmluvy, kontakty a mzdy sú v poriadku.`,
                `Csapat áttekintés: ${stats.active}/${stats.total} aktív alkalmazott. Minden szerződés, elérhetőség és bér rendben van.`
              )
            )}
          </p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className=" rounded-lg border border-gray-200 bg-white shadow-xs p-3 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Search by name, PIN, email or phone...", "Hľadať podľa mena, RČ, emailu...", "Keresés név, személyi szám szerint...")}
              className="w-full pl-9 pr-3.5 py-2 text-ui bg-gray-100/70 border border-gray-200/60 rounded-md text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-entity-ring focus:bg-white transition"
            />
          </div>

          {/* Status Segmented Buttons */}
          <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-md text-ui border border-gray-200/40">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white text-gray-900 shadow-xs font-bold"
                  : "text-gray-500 hover:text-gray-900 font-medium"
              }`}
            >
              {t("All", "Všetci", "Mind")}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                statusFilter === "active"
                  ? "bg-white text-gray-900 shadow-xs font-bold"
                  : "text-gray-500 hover:text-gray-900 font-medium"
              }`}
            >
              {t("Active", "Aktívni", "Aktív")}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                statusFilter === "inactive"
                  ? "bg-white text-gray-900 shadow-xs font-bold"
                  : "text-gray-500 hover:text-gray-900 font-medium"
              }`}
            >
              {t("Inactive", "Neaktívni", "Inaktív")}
            </button>
          </div>

          {hasOtherKinds && (
            <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-md text-ui border border-gray-200/40">
              {(["all", "employee", "contractor", "ledger"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`px-3 py-1 rounded-lg font-heading text-ui transition cursor-pointer ${
                    kindFilter === k
                      ? "bg-white text-gray-900 shadow-xs font-bold"
                      : "text-gray-500 hover:text-gray-900 font-medium"
                  }`}
                >
                  {k === "all" ? t("All types", "Všetky typy", "Minden típus") : kindLabels[k]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-md text-gray-500 border border-gray-200/40">
          {([
            { mode: "structure" as const, Icon: ListTree, label: t("Structure View", "Zobrazenie štruktúry", "Struktúra nézet") },
            { mode: "table" as const, Icon: List, label: t("Table View", "Tabuľka", "Táblázat") },
            { mode: "cards" as const, Icon: Grid, label: t("Card View", "Karty", "Kártyák") }
          ]).map(({ mode, Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === mode ? "bg-white text-gray-900 shadow-xs font-bold" : "hover:text-gray-800"
              }`}
              title={label}
              aria-label={label}
              aria-pressed={viewMode === mode}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* EMPTY STATE */}
      {filteredEmployees.length === 0 ? (
        <div className=" rounded-lg border border-gray-200 bg-white shadow-xs p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-lg mx-auto flex items-center justify-center shadow-inner" style={{ backgroundColor: SECTION_VISUALS.employees.bg, color: SECTION_VISUALS.employees.color }}>
            <SectionIcon id="employees" className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-title-sm font-heading font-extrabold text-gray-900">
              {t("No employees found", "Žiadni zamestnanci", "Nincsenek alkalmazottak")}
            </h3>
            <p className="text-ui text-gray-500 leading-relaxed">
              {employees.length === 0
                ? reseedHref
                  ? t(
                      "Start by adding your first team member, or re-seed the demo data in Settings to get the demo team with salaries and leave back.",
                      "Začnite pridaním prvého zamestnanca, alebo v Nastaveniach znovu naplňte demo dáta, aby sa vrátil demo tím s platmi a dovolenkami.",
                      "Adja hozzá első munkatársát, vagy a Beállításokban töltse újra a demo adatokat, hogy visszatérjen a demo csapat bérekkel és szabadságokkal."
                    )
                  : t(
                      "Start by adding your first team member.",
                      "Začnite pridaním prvého zamestnanca.",
                      "Adja hozzá első munkatársát."
                    )
                : t("Try changing your search query or filter options.", "Skúste upraviť vyhľadávací dotaz alebo filter.", "Próbálja módosítani a keresési feltételeket.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {employees.length === 0 && reseedHref && (
              <a
                href={reseedHref}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-heading font-bold text-ui shadow-lg shadow-amber-500/25 hover:shadow-xl transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t("Re-seed demo data", "Znovu naplniť demo dáta", "Demo adatok újratöltése")}</span>
              </a>
            )}
            {rights.edit && (
            <button
              type="button"
              onClick={onAddEmployee}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-entity-solid hover:bg-entity-solid-hover text-white font-heading font-bold text-ui shadow-lg shadow-2xs hover:shadow-xl transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t("Add Employee", "Nový zamestnanec", "Új alkalmazott")}</span>
            </button>
            )}
          </div>
        </div>
      ) : viewMode === "table" || isStructure ? (
        /* TABLE VIEW — the structure is the same table, in its hand-set order, with rows to drag */
        <div ref={resultsRef} className=" rounded-lg border border-gray-200 bg-white shadow-xs overflow-clip">
          {isStructure && (
            <p className="px-4 py-2.5 text-caption text-gray-500 border-b border-gray-200/60 bg-[#c29b62]/5">
              {t(
                "The structure keeps its own order. Drag rows to rearrange it.",
                "Štruktúra má vlastné poradie. Zmeníte ho potiahnutím riadkov.",
                "A struktúra a saját sorrendjében van. Sorok húzásával rendezheti át."
              )}
            </p>
          )}
          <div ref={tableWrapRef} className="table-page-wrap">
            <table className="w-full text-left text-ui border-collapse">
              <thead className="table-page-sticky-head">
                <tr className="border-b border-gray-200/80 bg-gray-50 text-gray-500 type-overline">
                  <th className="sticky z-10 bg-gray-50 py-3.5 px-4">{t("Employee", "Zamestnanec", "Alkalmazott")}</th>
                  <th className="sticky z-10 bg-gray-50 py-3.5 px-4">{t("Contact", "Kontakt", "Elérhetőség")}</th>
                  {rights.salaries && <th className="sticky z-10 bg-gray-50 py-3.5 px-4">{t("Salary & Terms", "Mzda a podmienky", "Bér és feltételek")}</th>}
                  <th className="sticky z-10 bg-gray-50 py-3.5 px-4">{t("Time Tracking", "Meranie času", "Időkövetés")}</th>
                  {rights.files && <th className="sticky z-10 bg-gray-50 py-3.5 px-4">{t("Contracts", "Zmluvy", "Szerződések")}</th>}
                  <th className="sticky z-10 bg-gray-50 py-3.5 px-4 text-center">{t("Status", "Stav", "Állapot")}</th>
                  <th className="sticky right-0 z-30 py-3.5 px-4 text-right bg-gray-50 border-l border-gray-200/80">{t("Actions", "Akcie", "Műveletek")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shownEmployees.map((emp) => {
                  const initials = emp.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  const drop = employeeDrag.dropAt(emp.id);

                  return (
                    <tr
                      key={emp.id}
                      data-employee-row={emp.id}
                      {...employeeDrag.rowProps(emp.id)}
                      onClick={() => onSelectEmployee(emp.id)}
                      className={`hover:bg-gray-500/5 cursor-pointer transition group ${
                        employeeDrag.draggedId === emp.id ? "opacity-40" : ""
                      } ${
                        // A table row cannot hold a positioned marker, so the drop line is an inset edge on its cells.
                        drop === "before" ? "[&>td]:shadow-[inset_0_2px_0_0_#c29b62]"
                          : drop === "after" ? "[&>td]:shadow-[inset_0_-2px_0_0_#c29b62]" : ""
                      }`}
                    >
                      {/* Employee Name & Role / PIN */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {/* The structure's move handle: always shown, the whole row drags. */}
                          {isStructure && (
                            <Move
                              aria-hidden
                              data-structure-handle
                              className="w-3.5 h-3.5 shrink-0 text-gray-300 group-hover:text-[#c29b62] transition-colors cursor-grab active:cursor-grabbing"
                            />
                          )}
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#c29b62]/20 to-[#9e7638]/20 border border-entity-border text-[#9e7638] flex items-center justify-center font-heading font-bold text-ui shrink-0 shadow-xs">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <a
                              href={`#employees/${encodeURIComponent(emp.id)}`}
                              draggable={false}
                              onClick={(e) => {
                                e.preventDefault();
                                onSelectEmployee(emp.id);
                              }}
                              className="font-heading font-bold text-gray-900 block group-hover:text-[#c29b62] transition truncate text-body"
                            >
                              {emp.name}
                            </a>
                            <div className="flex items-center gap-2 mt-0.5">
                              {employeeKind(emp) !== "employee" && (
                                <span className="text-micro font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-1.5">
                                  {kindLabels[employeeKind(emp)]}
                                </span>
                              )}
                              {needsFullName(emp) && (
                                <span
                                  className="text-micro font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5"
                                  title={t("First name and last name are missing", "Chýba meno alebo priezvisko", "Hiányzik a kereszt- vagy vezetéknév")}
                                >
                                  {t("Add full name", "Doplniť meno", "Név pótlása")}
                                </span>
                              )}
                              {(emp.position || emp.department) && (
                                <span className="text-caption font-medium text-gray-500 truncate block">
                                  {[emp.position, emp.department].filter(Boolean).join(" · ")}
                                </span>
                              )}
                              {emp.pin && (
                                <span className="text-micro font-mono text-gray-400">
                                  • {emp.pin}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4 text-gray-600">
                        {emp.email && <div className="truncate font-medium">{emp.email}</div>}
                        {emp.phone && <div className="text-micro text-gray-400 mt-0.5">{emp.phone}</div>}
                      </td>

                      {/* Compensation */}
                      {rights.salaries && (
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-gray-900 block text-ui">
                          {formatNumber(emp.salaryAmount, systemLanguage)} {systemCurrency}
                        </span>
                        <span className="text-micro text-gray-400 block mt-0.5">
                          {emp.salaryType === "hourly"
                            ? t("hourly", "hodinová", "órabér")
                            : emp.salaryType === "daily"
                            ? t("daily", "denná", "napibér")
                            : t("monthly", "mesačná", "havibér")}{" "}
                          • {t("Due", "Splatnosť", "Esedékes")}: {emp.salaryDueDay || (settings.salaryDueDay ?? 15)}.
                        </span>
                      </td>
                      )}

                      {/* Time tracking mapping */}
                      <td className="py-3.5 px-4">
                        {emp.timeTrackingUserId ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-bold bg-entity-subtle text-[#9e7638] border border-entity-border">
                            <Clock className="w-3 h-3 text-[#c29b62]" />
                            <span className="truncate max-w-30">{emp.timeTrackingUserName || emp.timeTrackingUserId}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-micro">—</span>
                        )}
                      </td>

                      {/* Contracts count */}
                      {rights.files && (
                      <td className="py-3.5 px-4">
                        {emp.files && emp.files.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-caption text-gray-700 font-semibold">
                            <FileText className="w-3.5 h-3.5 text-[#c29b62]" />
                            <span>{emp.files.length}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-micro">0</span>
                        )}
                      </td>
                      )}

                      {/* Status badge */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full type-overline ${
                            emp.isActive !== false
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-gray-100 text-gray-500 border border-gray-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.isActive !== false ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                          {emp.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right sticky right-0 z-10 bg-white group-hover:bg-gray-50 border-l border-gray-100/80 transition-colors">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {rights.edit && (
                          <button
                            type="button"
                            onClick={() => onEditEmployee(emp)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                            title={t("Edit", "Upraviť", "Szerkesztés")}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          )}
                          {rights.delete && (
                          <HoldToConfirmButton
                              tone="danger"
                              lang={asLang(systemLanguage)}
                              what={emp.name}
                              onConfirm={() => onDeleteEmployee(emp.id)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                              title={t("Delete", "Zmazať", "Törlés")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </HoldToConfirmButton>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition ml-1" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <StickyHScrollbar target={tableWrapEl} />
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
                className=" rounded-lg border border-gray-200 bg-white shadow-xs p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between space-y-4 group cursor-pointer relative"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#c29b62]/20 to-[#9e7638]/20 border border-entity-border text-[#9e7638] flex items-center justify-center font-heading font-bold text-body shrink-0 shadow-xs">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <a
                          href={`#employees/${encodeURIComponent(emp.id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            onSelectEmployee(emp.id);
                          }}
                          className="font-heading font-bold text-body text-gray-900 group-hover:text-[#c29b62] transition truncate block"
                        >
                          {emp.name}
                        </a>
                        {emp.position || emp.department ? (
                          <span className="text-caption font-medium text-gray-500 truncate block">
                            {[emp.position, emp.department].filter(Boolean).join(" · ")}
                          </span>
                        ) : emp.pin ? (
                          <span className="text-micro font-mono text-gray-400 block">{emp.pin}</span>
                        ) : (
                          <span className="text-micro text-gray-400 block">{emp.addressCity || "—"}</span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full type-overline shrink-0 ${
                        emp.isActive !== false
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${emp.isActive !== false ? "bg-emerald-500" : "bg-gray-400"}`} />
                      {emp.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 text-ui text-gray-600">
                    {emp.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate font-medium">{emp.email}</span>
                      </div>
                    )}
                    {emp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-gray-500">{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-ui">
                  <div>
                    {rights.salaries && (<>
                    <span className="font-mono font-bold text-gray-900 block text-body">
                      {formatNumber(emp.salaryAmount, systemLanguage)} {systemCurrency}
                    </span>
                    <span className="text-micro text-gray-400 font-medium">
                      {emp.salaryType === "hourly"
                        ? t("hourly", "hodinová", "órabér")
                        : emp.salaryType === "daily"
                        ? t("daily", "denná", "napibér")
                        : t("monthly", "mesačná", "havibér")}
                    </span>
                    </>)}
                  </div>

                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rights.edit && (
                    <button
                      type="button"
                      onClick={() => onEditEmployee(emp)}
                      className="p-2 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition cursor-pointer"
                      title={t("Edit", "Upraviť", "Szerkesztés")}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    )}
                    {rights.delete && <HoldToConfirmButton
                        tone="danger"
                        lang={asLang(systemLanguage)}
                        what={emp.name}
                        onConfirm={() => onDeleteEmployee(emp.id)}
                        className="p-2 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition"
                        title={t("Delete", "Zmazať", "Törlés")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </HoldToConfirmButton>}
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
