import React, { useState, useMemo } from "react";
import {
  Users,
  Coins,
  Sparkles,
  Settings as SettingsIcon,
  ChevronRight
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
import { EmployeeFormModal } from "./EmployeeFormModal";
import { EmployeeSettingsModal } from "./EmployeeSettingsModal";
import { useConfirmDialog } from "../ui/ConfirmDialog";

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
  // Navigation inside Employees Module
  const [currentView, setCurrentView] = useState<"list" | "detail" | "matrix">("list");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [confirmAction, confirmDialog] = useConfirmDialog();

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  // Safe resolved settings
  const resolvedSettings: EmployeeSettings = useMemo(() => {
    return employeeSettings || DEFAULT_MOCK_SETTINGS;
  }, [employeeSettings]);

  // Selected Employee object
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
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
        setSelectedEmployeeId(null);
        setCurrentView("list");
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
      {/* Top Module Sub-Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 pb-3">
        {/* Sub-view switcher tabs */}
        <div className="flex items-center gap-2">
          <div className="glass-panel p-1 rounded-2xl flex items-center gap-1.5 border border-white/60 bg-white/95 shadow-glass">
            <button
              type="button"
              onClick={() => {
                setSelectedEmployeeId(null);
                setCurrentView("list");
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-all cursor-pointer ${
                currentView === "list"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/25"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t("Employees Directory", "Zoznam zamestnancov", "Munkatársak négyzete")}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedEmployeeId(null);
                setCurrentView("matrix");
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-all cursor-pointer ${
                currentView === "matrix"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/25"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>{t("Salaries Matrix", "Matica miezd", "Bérmátrix")}</span>
            </button>
          </div>

          {currentView === "detail" && selectedEmployee && (
            <div className="flex items-center gap-2 pl-2">
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-heading font-bold text-[#b58b4c]">
                {selectedEmployee.name}
              </span>
            </div>
          )}
        </div>

        {/* Quick Toolbar (Demo Seed if empty, Settings) */}
        <div className="flex items-center gap-2">
          {employees.length === 0 && (
            <button
              type="button"
              onClick={handleSeedMockData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs font-bold hover:bg-amber-500/20 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>{t("Load Demo Staff", "Vzorové dáta", "Minta adatok")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel border border-white/60 bg-white/95 shadow-glass text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            title={t("Module Settings", "Nastavenia modulu", "Modul beállítások")}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("Settings", "Nastavenia", "Beállítások")}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div>
        {currentView === "list" && (
          <EmployeeListView
            employees={employees}
            salaries={salaries}
            vacations={vacations}
            settings={resolvedSettings}
            onSelectEmployee={(empId) => {
              setSelectedEmployeeId(empId);
              setCurrentView("detail");
            }}
            onAddEmployee={() => {
              setEmployeeToEdit(null);
              setIsAddModalOpen(true);
            }}
            onEditEmployee={(emp) => {
              setEmployeeToEdit(emp);
              setIsAddModalOpen(true);
            }}
            onDeleteEmployee={handleDeleteEmployee}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenMatrix={() => setCurrentView("matrix")}
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
            onBack={() => {
              setSelectedEmployeeId(null);
              setCurrentView("list");
            }}
            onUpdateEmployee={handleSaveEmployee}
            onSaveSalary={handleSaveSalary}
            onSaveVacation={handleSaveVacation}
            onDeleteVacation={handleDeleteVacation}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
          />
        )}

        {currentView === "matrix" && (
          <SalariesMatrixView
            employees={employees}
            salaries={salaries}
            settings={resolvedSettings}
            onSaveSalary={handleSaveSalary}
            systemLanguage={systemLanguage}
            systemCurrency={systemCurrency}
            onSelectEmployee={(empId) => {
              setSelectedEmployeeId(empId);
              setCurrentView("detail");
            }}
          />
        )}
      </div>

      {/* Add / Edit Employee Modal */}
      {isAddModalOpen && (
        <EmployeeFormModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEmployeeToEdit(null);
          }}
          employee={employeeToEdit}
          onSave={(emp) => {
            handleSaveEmployee(emp);
            setIsAddModalOpen(false);
            setEmployeeToEdit(null);
          }}
          settings={resolvedSettings}
          financialCategories={financialCategories}
          systemLanguage={systemLanguage}
          systemCurrency={systemCurrency}
        />
      )}

      {/* Global Module Settings Modal */}
      {isSettingsOpen && (
        <EmployeeSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={resolvedSettings}
          onSave={handleSaveSettings}
          financialCategories={financialCategories}
          systemLanguage={systemLanguage}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDialog}
    </div>
  );
};

export default EmployeesView;
