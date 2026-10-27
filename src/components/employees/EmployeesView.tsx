import React, { useState, useEffect, useMemo } from "react";
import { SectionIcon } from "../icons/SectionIcon";
import {
  Users,
  Coins,
  Sparkles,
  Plus,
  Settings as SettingsIcon,
  ChevronRight,
  Loader2,
  UserRound
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation,
  FinancialCategory,
  UserProfile as AuthUser,
  RolePermission
} from "../../types";
import type { ModuleAccess } from "../../utils/permissions";
import { FULL_EMPLOYEE_RIGHTS, type EmployeeRights } from "../../utils/employeeRights";
import {
  DEFAULT_MOCK_EMPLOYEES,
  generateDefaultMockSalaries,
  generateDefaultMockVacations,
  DEFAULT_MOCK_SETTINGS
} from "../../utils/mockEmployees";
import { EmployeeListView } from "./EmployeeListView";
import { EmployeeDetailView } from "./EmployeeDetailView";
import { SalariesMatrixView } from "./SalariesMatrixView";
import { EmployeeFormScreen } from "./EmployeeFormScreen";
import { EmployeeSettingsScreen } from "./EmployeeSettingsScreen";
import { MyEmploymentView } from "./MyEmploymentView";
import { PageHeader, Tabs, type TabItem } from "../layout";
import { deleteRecordsWithUndo } from "../../utils/recordActions";
import { asLang } from "../../utils/undoMessages";

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
  /** Sample staff is demo data: only a demo install may load or auto-seed it. */
  isDemoMode?: boolean;
  /** What this person may see and change, field group by field group (see utils/employeeRights). */
  rights?: EmployeeRights;
  /** Logins, for the "linked user account" picker. */
  users?: AuthUser[];
  /** Role registry, to warn when a linked login can open this whole module. */
  roles?: RolePermission[];
  /** The person may open the "My employment" tab (any self.* permission). */
  selfService?: boolean;
}

type EmployeesViewName = "list" | "detail" | "matrix" | "form" | "settings" | "me";

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
  view: EmployeesViewName;
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

  // 0. #employees/me or the old #my-employment address: the signed-in person's own data
  if (base === "my-employment" || base === "my_employment" || base === "myemployment" || (base === "employees" && (sub === "me" || sub === "my-employment"))) {
    return { view: "me", employeeId: null, editEmployee: null };
  }

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
  financialCategories = [],
  isDemoMode = false,
  rights = FULL_EMPLOYEE_RIGHTS,
  users = [],
  roles = [],
  selfService = false
}) => {
  // Navigation state derived from URL hash
  const initialUrlState = useMemo(() => parseEmployeesUrlState(employees), []);
  const [requestedView, setCurrentView] = useState<EmployeesViewName>(initialUrlState.view);
  // A typed or bookmarked address never opens a screen this person has no right to: the directory,
  // pay matrix and employee screens need the employees module (a regular employee lands on their
  // own tab), the pay matrix needs the pay toggle, create / edit needs employees = edit, settings
  // needs general_config, and My employment needs a self-service permission.
  const currentView: EmployeesViewName = (() => {
    const needsDirectory =
      requestedView === "list" || requestedView === "detail" || requestedView === "matrix" || requestedView === "form";
    if (needsDirectory && !rights.view) return selfService ? "me" : "list";
    if (requestedView === "me" && !selfService) return "list";
    if (
      (requestedView === "matrix" && !rights.salaries) ||
      (requestedView === "form" && !rights.edit) ||
      (requestedView === "settings" && !rights.canConfigure)
    ) {
      return "list";
    }
    return requestedView;
  })();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(initialUrlState.employeeId);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(initialUrlState.editEmployee);
  const [isEditMode, setIsEditMode] = useState<boolean>(!!initialUrlState.isEditMode);

  // Navigation helpers that update URL hash
  const navigateToTab = (tab: "list" | "matrix" | "settings" | "me") => {
    if (tab === "matrix") {
      window.location.hash = "employees/salaries";
    } else if (tab === "settings") {
      window.location.hash = "employees/settings";
    } else if (tab === "me") {
      window.location.hash = "employees/me";
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
    // Anchored to today so the calendar and salary matrix open on populated months
    const now = new Date();
    setSalaries(generateDefaultMockSalaries(now));
    setVacations(generateDefaultMockVacations(now));
    if (!employeeSettings || !employeeSettings.salaryTypes?.length) {
      setEmployeeSettings(DEFAULT_MOCK_SETTINGS);
    }
  }, [setEmployees, setSalaries, setVacations, setEmployeeSettings, employeeSettings]);

  // Demo installs only: auto-seed on mount if the employees array is empty so the
  // module immediately displays rich data. A real install starts empty.
  const initialCheckRef = React.useRef(false);
  React.useEffect(() => {
    if (isDemoMode && rights.edit && !initialCheckRef.current && employees.length === 0) {
      initialCheckRef.current = true;
      handleSeedMockData();
    }
  }, [isDemoMode, employees.length, handleSeedMockData]);

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

  // Handle Delete Employee — the hold on the button is the confirmation; the
  // server delete waits for the undo window (utils/recordActions).
  const handleDeleteEmployee = (empId: string) => {
    const target = employees.find((e) => e.id === empId);
    if (!target) return;
    deleteRecordsWithUndo({
      collection: "employees",
      allRecords: employees,
      targets: [target],
      setRecords: setEmployees,
      lang: asLang(systemLanguage),
      entity: "employee",
      titleOf: (e) => e.name,
      applyExtra: () => {
        if (selectedEmployeeId === empId) navigateToTab("list");
      },
    });
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
    const target = vacations.find((v) => v.id === vacId);
    if (!target) return;
    deleteRecordsWithUndo({
      collection: "employeeVacations",
      allRecords: vacations,
      targets: [target],
      setRecords: setVacations,
      lang: asLang(systemLanguage),
      entity: "record",
      titleOf: () => employees.find((e) => e.id === target.employeeId)?.name,
    });
  };

  // Handle Save Settings
  const handleSaveSettings = (updated: EmployeeSettings) => {
    setEmployeeSettings(updated);
  };

  // One section, several audiences: the directory / payroll tabs need the employees module, the
  // My employment tab needs a self-service permission, settings needs general_config.
  const tabItems: TabItem<"list" | "matrix" | "me" | "settings">[] = [
    { key: "list", icon: <Users className="w-3.5 h-3.5" />, label: t("Employees Directory", "Zoznam zamestnancov", "Munkatársak négyzete"), hidden: !rights.view },
    { key: "matrix", icon: <Coins className="w-3.5 h-3.5" />, label: t("Salaries Matrix", "Matica miezd", "Bérmátrix"), hidden: !rights.view || !rights.salaries },
    { key: "me", icon: <UserRound className="w-3.5 h-3.5" />, label: t("My employment", "Moje zamestnanie", "Munkaviszonyom"), hidden: !selfService },
    { key: "settings", icon: <SettingsIcon className="w-3.5 h-3.5" />, label: t("Settings", "Nastavenia", "Beállítások"), hidden: !rights.canConfigure },
  ];

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
      {/* Module header: title first, then the sub-navigation (docs/VIEW-SIZE.md §6.1) */}
      {currentView !== "form" && (
        <PageHeader
          icon={<SectionIcon id="employees" />}
          title={t("People", "Ľudia", "Munkatársak")}
          subtitle={t(
            "Your employment, staff directory, payroll, time tracking & leave",
            "Vaše zamestnanie, zoznam zamestnancov, mzdy, meranie času a dovolenky",
            "Munkaviszonya, munkatársak, bérek, időkövetés és szabadságok"
          )}
          actions={
            currentView === "list" ? (
              <>
                {isDemoMode && rights.edit && employees.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedMockData}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-ui font-semibold hover:bg-amber-500/20 transition-all"
                  >
                    <Sparkles className="size-4 text-amber-600" />
                    <span>{t("Load Demo Staff", "Vzorové dáta", "Minta adatok")}</span>
                  </button>
                )}
                {rights.edit && (
                <button
                  type="button"
                  onClick={() => navigateToAddEmployee()}
                  className="flex items-center gap-2 h-9 px-3 rounded-xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white text-ui font-semibold shadow-md shadow-[#c29b62]/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>{t("Add Employee", "Nový zamestnanec", "Új alkalmazott")}</span>
                </button>
                )}
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
            {tabItems.filter((i) => !i.hidden).length > 1 && (
              <Tabs
                value={currentView === "list" || currentView === "matrix" || currentView === "me" || currentView === "settings" ? currentView : "list"}
                onChange={navigateToTab}
                items={tabItems}
              />
            )}

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
            {isDemoMode && rights.edit && employees.length === 0 && (
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
            onSeedMockData={isDemoMode ? handleSeedMockData : undefined}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
            rights={rights}
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
            rights={rights}
            users={users}
            roles={roles}
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
            rights={rights}
            employees={employees}
            users={users}
            roles={roles}
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

        {currentView === "me" && (
          <MyEmploymentView
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
            embedded
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
    </div>
  );
};

export default EmployeesView;
