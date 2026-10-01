import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Coins,
  Sparkles,
  Plus,
  Settings as SettingsIcon,
  ChevronRight,
  Loader2
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation,
  FinancialCategory,
  UserProfile as AuthUser
} from "../../types";
import type { ModuleAccess } from "../../utils/permissions";
import {
  DEFAULT_MOCK_EMPLOYEES,
  generateDefaultMockSalaries,
  DEFAULT_MOCK_VACATIONS,
  DEFAULT_MOCK_SETTINGS
} from "../../utils/mockEmployees";
import { EmployeeListView } from "./EmployeeListView";
import { EmployeeDetailView } from "./EmployeeDetailView";
import { SalariesMatrixView } from "./SalariesMatrixView";
import { EmployeeFormScreen } from "./EmployeeFormScreen";
import { EmployeeSettingsScreen } from "./EmployeeSettingsScreen";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import { PageHeader, Tabs } from "../layout";
import { EmployeeTieIcon } from "../icons/EmployeeTieIcon";

interface EmployeesViewProps {
  access: ModuleAccess;
  systemLanguage?: string;
  systemCurrency?: string;
  currentUser?: AuthUser | null;
  employees: Employee[];
  setEmployees: (employees: Employee[] | ((prev: Employee[]) => Employee[])) => void;
  salaries: EmployeeSalary[];
  setSalaries: (salaries: EmployeeSalary[] | ((prev: EmployeeSalary[]) => EmployeeSalary[])) => void;
  vacations: EmployeeVacation[];
  setVacations: (vacations: EmployeeVacation[] | ((prev: EmployeeVacation[]) => EmployeeVacation[])) => void;
  employeeSettings?: EmployeeSettings | null;
  setEmployeeSettings: (settings: EmployeeSettings | ((prev: EmployeeSettings) => EmployeeSettings)) => void;
  financialCategories: FinancialCategory[];
}

// Helper to resolve an employee by ID, case-insensitive ID, name, or name slug
export const findEmployeeByIdOrSlug = (
  allEmployees: Employee[],
  rawIdentifier: string | null | undefined
): Employee | null => {
  if (!rawIdentifier || !allEmployees.length) return null;
  const decoded = decodeURIComponent(rawIdentifier).trim().toLowerCase();
  if (!decoded) return null;

  // 1. Exact ID or case-insensitive ID
  const byId = allEmployees.find(
    (e) => e.id === rawIdentifier || e.id.toLowerCase() === decoded
  );
  if (byId) return byId;

  // Helper to generate a clean URL slug from name
  const slugify = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // 2. Slug match (e.g. "peter-kovac" matches "Peter Kováč")
  const targetSlug = slugify(decoded);
  const bySlug = allEmployees.find((e) => slugify(e.name) === targetSlug);
  if (bySlug) return bySlug;

  // 3. Name match (case-insensitive)
  const byName = allEmployees.find((e) => e.name.toLowerCase() === decoded);
  if (byName) return byName;

  return null;
};

// Helper to parse view & parameters from URL hash
const parseEmployeesUrlState = (
  allEmployees: Employee[]
): {
  view: "list" | "detail" | "matrix" | "form" | "settings";
  employeeId: string | null;
  editEmployee: Employee | null;
  isEditMode?: boolean;
} => {
  const raw = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  const [pathPart, queryPart] = raw.split("?");
  const parts = (pathPart || "").split("/").filter(Boolean);
  const base = (parts[0] || "").toLowerCase();
  const sub = (parts[1] || "").toLowerCase();
  const params = new URLSearchParams(queryPart || "");

  // 1. #employee-<idOrSlug> (e.g. #employee-emp_1 or #employee-peter-kovac)
  if (base.startsWith("employee-")) {
    const rawId = parts[0].slice(9);
    const emp = findEmployeeByIdOrSlug(allEmployees, rawId);
    return {
      view: "detail",
      employeeId: emp ? emp.id : rawId,
      editEmployee: null
    };
  }

  // 2. Hash: #salaries or #employees/salaries or #employees/matrix
  if (base === "salaries" || (base === "employees" && (sub === "salaries" || sub === "matrix" || sub === "mzdy" || sub === "berek"))) {
    return { view: "matrix", employeeId: null, editEmployee: null };
  }

  // 3. Hash: #employees/settings
  if (base === "employees" && (sub === "settings" || sub === "nastavenia" || sub === "beallitasok")) {
    return { view: "settings", employeeId: null, editEmployee: null };
  }

  // 4. Hash: #employees/new or #employees/create or #employees/add
  if (base === "employees" && (sub === "new" || sub === "create" || sub === "add")) {
    return { view: "form", employeeId: null, editEmployee: null };
  }

  // 5. Hash: #employees/edit?id=xxx or #employees/edit/<id> or #employees/<id>/edit -> opens detail view with in-place card editing
  if (base === "employees" && sub === "edit") {
    const id = params.get("id") || parts[2] || null;
    const emp = findEmployeeByIdOrSlug(allEmployees, id);
    return { view: "detail", employeeId: emp ? emp.id : id, editEmployee: emp, isEditMode: true };
  }
  if ((base === "employees" || base === "employee") && parts[2] && parts[2].toLowerCase() === "edit") {
    const id = parts[1];
    const emp = findEmployeeByIdOrSlug(allEmployees, id);
    return { view: "detail", employeeId: emp ? emp.id : id, editEmployee: emp, isEditMode: true };
  }

  // 6. Hash: #employees/detail?id=xxx or #employees?id=xxx
  const queryId = params.get("id");
  if (base === "employees" && (sub === "detail" || queryId)) {
    const id = queryId || parts[2] || null;
    const emp = findEmployeeByIdOrSlug(allEmployees, id);
    return { view: id ? "detail" : "list", employeeId: emp ? emp.id : id, editEmployee: null };
  }

  // 7. Direct employee route: #employees/<idOrSlug> or #employee/<idOrSlug>
  if ((base === "employees" || base === "employee") && parts[1]) {
    const rawId = parts[1];
    if (rawId !== "directory" && rawId !== "list") {
      const emp = findEmployeeByIdOrSlug(allEmployees, rawId);
      return {
        view: "detail",
        employeeId: emp ? emp.id : rawId,
        editEmployee: null
      };
    }
  }

  // Default: directory list (#employees or #employees/directory)
  return { view: "list", employeeId: null, editEmployee: null };
};

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  access: _access,
  systemLanguage = "sk",
  systemCurrency = "€",
  currentUser: _currentUser,
  employees = [],
  setEmployees,
  salaries = [],
  setSalaries,
  vacations = [],
  setVacations,
  employeeSettings,
  setEmployeeSettings,
  financialCategories = []
}) => {
  // Navigation state derived from URL hash
  const initialUrlState = useMemo(() => parseEmployeesUrlState(employees), []);
  const [currentView, setCurrentView] = useState<"list" | "detail" | "matrix" | "form" | "settings">(initialUrlState.view);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(initialUrlState.employeeId);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(initialUrlState.editEmployee);
  const [isEditMode, setIsEditMode] = useState<boolean>(!!initialUrlState.isEditMode);
  const [confirmAction, confirmDialog] = useConfirmDialog();

  // Navigation helpers that update URL hash
  const navigateToTab = (tab: "list" | "matrix" | "settings") => {
    if (tab === "matrix") {
      window.location.hash = "employees/salaries";
    } else if (tab === "settings") {
      window.location.hash = "employees/settings";
    } else {
      window.location.hash = "employees";
    }
  };

  const navigateToEmployeeDetail = (empId: string, subTab?: string) => {
    const tabSuffix = subTab ? `?tab=${encodeURIComponent(subTab)}` : "";
    window.location.hash = `employees/${encodeURIComponent(empId)}${tabSuffix}`;
  };

  const navigateToAddEmployee = () => {
    window.location.hash = "employees/new";
  };

  const navigateToEditEmployee = (empId: string) => {
    window.location.hash = `employees/${encodeURIComponent(empId)}/edit`;
  };

  // Synchronize view state with URL hash (supports browser back/forward and deep links)
  useEffect(() => {
    const handleHashChange = () => {
      const state = parseEmployeesUrlState(employees);
      setCurrentView(state.view);
      setSelectedEmployeeId(state.employeeId);
      setEmployeeToEdit(state.editEmployee);
      setIsEditMode(!!state.isEditMode);
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [employees]);

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  // Safe resolved settings
  const resolvedSettings: EmployeeSettings = useMemo(() => {
    return employeeSettings || DEFAULT_MOCK_SETTINGS;
  }, [employeeSettings]);

  // Selected Employee object (matches ID or slug)
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return findEmployeeByIdOrSlug(employees, selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  // Handle Seed Mock Data
  const handleSeedMockData = React.useCallback(() => {
    setEmployees(DEFAULT_MOCK_EMPLOYEES);
    setSalaries(generateDefaultMockSalaries(new Date().getFullYear()));
    setVacations(DEFAULT_MOCK_VACATIONS);
    if (!employeeSettings || !employeeSettings.salaryTypes?.length) {
      setEmployeeSettings(DEFAULT_MOCK_SETTINGS);
    }
  }, [setEmployees, setSalaries, setVacations, setEmployeeSettings, employeeSettings]);

  // Auto-seed on mount if employees array is empty so the module immediately displays rich data
  const initialCheckRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialCheckRef.current && employees.length === 0) {
      initialCheckRef.current = true;
      handleSeedMockData();
    }
  }, [employees.length, handleSeedMockData]);

  // Handle Save Employee (create or update)
  const handleSaveEmployee = (emp: Employee) => {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === emp.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = emp;
        return copy;
      }
      return [emp, ...prev];
    });
  };

  // Handle Delete Employee
  const handleDeleteEmployee = async (empId: string) => {
    const ok = await confirmAction({
      title: t("Delete Employee", "Zmazať zamestnanca", "Alkalmazott törlése"),
      message: t(
        "Are you sure you want to delete this employee? Their profile and records will be removed.",
        "Naozaj chcete zmazať tohto zamestnanca? Jeho profil a záznamy budú odstránené.",
        "Biztosan törölni szeretné ezt az alkalmazottat?"
      ),
      confirmLabel: t("Delete", "Zmazať", "Törlés"),
      cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
      danger: true
    });
    if (ok) {
      setEmployees((prev) => prev.filter((e) => e.id !== empId));
      if (selectedEmployeeId === empId) {
        navigateToTab("list");
      }
    }
  };

  // Handle Save Salary
  const handleSaveSalary = (salary: EmployeeSalary) => {
    setSalaries((prev) => {
      const idx = prev.findIndex((s) => s.id === salary.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = salary;
        return copy;
      }
      return [salary, ...prev];
    });
  };

  // Handle Save Vacation
  const handleSaveVacation = (vac: EmployeeVacation) => {
    setVacations((prev) => {
      const idx = prev.findIndex((v) => v.id === vac.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = vac;
        return copy;
      }
      return [vac, ...prev];
    });
  };

  // Handle Delete Vacation
  const handleDeleteVacation = (vacId: string) => {
    setVacations((prev) => prev.filter((v) => v.id !== vacId));
  };

  // Handle Save Settings
  const handleSaveSettings = (updated: EmployeeSettings) => {
    setEmployeeSettings(updated);
  };

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
      {/* Module header: title first, then the sub-navigation (docs/VIEW-SIZE.md §6.1) */}
      {currentView !== "form" && (
        <PageHeader
          icon={<EmployeeTieIcon className="size-6" color="#9e7638" />}
          title={t("Employees & Payroll", "Zamestnanci a mzdy", "Alkalmazottak és bérek")}
          subtitle={t(
            "Staff directory, salary structures, Toggl time tracking & vacation planner",
            "Prehľad zamestnancov, štruktúra miezd, meranie času a plánovač dovoleniek",
            "Munkatársak, bérstruktúra, időkövetés és szabadságtervező"
          )}
          actions={
            currentView === "list" ? (
              <>
                {employees.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedMockData}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-ui font-semibold hover:bg-amber-500/20 transition-all"
                  >
                    <Sparkles className="size-4 text-amber-600" />
                    <span>{t("Load Demo Staff", "Vzorové dáta", "Minta adatok")}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigateToAddEmployee()}
                  className="flex items-center gap-2 h-9 px-3 rounded-xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white text-ui font-semibold shadow-md shadow-[#c29b62]/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>{t("Add Employee", "Nový zamestnanec", "Új alkalmazott")}</span>
                </button>
              </>
            ) : undefined
          }
        />
      )}

      {/* Sub-navigation (hidden when in full-screen employee form) */}
      {currentView !== "form" && (
        <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-4 border-b border-slate-200/60 pb-3">
          {/* Sub-view switcher tabs */}
          <div className="flex items-center gap-2">
            <Tabs
              value={currentView === "detail" ? "list" : currentView}
              onChange={navigateToTab}
              items={[
                { key: "list", icon: <Users className="w-3.5 h-3.5" />, label: t("Employees Directory", "Zoznam zamestnancov", "Munkatársak négyzete") },
                { key: "matrix", icon: <Coins className="w-3.5 h-3.5" />, label: t("Salaries Matrix", "Matica miezd", "Bérmátrix") },
                { key: "settings", icon: <SettingsIcon className="w-3.5 h-3.5" />, label: t("Settings", "Nastavenia", "Beállítások") },
              ]}
            />

            {currentView === "detail" && selectedEmployee && (
              <div className="flex items-center gap-2 pl-2">
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-ui font-heading font-bold text-[#b58b4c]">
                  {selectedEmployee.name}
                </span>
              </div>
            )}
          </div>

          {/* Quick Toolbar (Demo Seed if empty) */}
          <div className="flex items-center gap-2">
            {employees.length === 0 && (
              <button
                type="button"
                onClick={handleSeedMockData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-ui font-bold hover:bg-amber-500/20 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{t("Load Demo Staff", "Vzorové dáta", "Minta adatok")}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div>
        {currentView === "list" && (
          <EmployeeListView
            employees={employees}
            salaries={salaries}
            vacations={vacations}
            settings={resolvedSettings}
            onSelectEmployee={(empId) => navigateToEmployeeDetail(empId)}
            onAddEmployee={() => navigateToAddEmployee()}
            onEditEmployee={(emp) => navigateToEditEmployee(emp.id)}
            onDeleteEmployee={handleDeleteEmployee}
            onOpenSettings={() => navigateToTab("settings")}
            onOpenMatrix={() => navigateToTab("matrix")}
            onSeedMockData={handleSeedMockData}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
          />
        )}

        {currentView === "detail" && selectedEmployee && (
          <EmployeeDetailView
            employee={selectedEmployee}
            employees={employees}
            salaries={salaries}
            vacations={vacations}
            settings={resolvedSettings}
            financialCategories={financialCategories}
            onBack={() => navigateToTab("list")}
            onUpdateEmployee={handleSaveEmployee}
            onEditEmployee={(emp) => navigateToEditEmployee(emp.id)}
            initialEditMode={isEditMode}
            onSaveSalary={handleSaveSalary}
            onSaveVacation={handleSaveVacation}
            onDeleteVacation={handleDeleteVacation}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
          />
        )}

        {currentView === "detail" && !selectedEmployee && (
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-12 text-center space-y-4 animate-fade-in">
            {employees.length === 0 ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#c29b62]" />
                <p className="text-body font-medium text-slate-500">
                  {t("Loading employee profile...", "Načítavam profil zamestnanca...", "Alkalmazotti profil betöltése...")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center font-bold text-title">
                  !
                </div>
                <div>
                  <h3 className="text-title-sm font-heading font-bold text-slate-900">
                    {t("Employee Not Found", "Zamestnanec sa nenašiel", "Az alkalmazott nem található")}
                  </h3>
                  <p className="text-ui text-slate-500 mt-1">
                    {t(
                      "The requested employee does not exist or may have been removed.",
                      "Požadovaný zamestnanec neexistuje alebo bol odstránený.",
                      "A keresett alkalmazott nem létezik vagy törölve lett."
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToTab("list")}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white text-ui font-heading font-bold shadow-sm hover:shadow transition cursor-pointer"
                >
                  {t("Back to Directory", "Späť do zoznamu", "Vissza a listához")}
                </button>
              </div>
            )}
          </div>
        )}

        {currentView === "matrix" && (
          <SalariesMatrixView
            employees={employees}
            salaries={salaries}
            settings={resolvedSettings}
            onSaveSalary={handleSaveSalary}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
            onSelectEmployee={(empId) => navigateToEmployeeDetail(empId)}
          />
        )}

        {currentView === "form" && (
          <EmployeeFormScreen
            employee={employeeToEdit}
            settings={resolvedSettings}
            financialCategories={financialCategories}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
            onSave={(emp) => {
              handleSaveEmployee(emp);
              navigateToEmployeeDetail(emp.id);
            }}
            onCancel={() => {
              if (selectedEmployeeId) {
                navigateToEmployeeDetail(selectedEmployeeId);
              } else {
                navigateToTab("list");
              }
            }}
          />
        )}

        {currentView === "settings" && (
          <EmployeeSettingsScreen
            settings={resolvedSettings}
            financialCategories={financialCategories}
            onSave={(updated) => {
              handleSaveSettings(updated);
            }}
            onCancel={() => {
              navigateToTab("list");
            }}
            systemLanguage={systemLanguage}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {confirmDialog}
    </div>
  );
};

export default EmployeesView;
