import React, { useState, useMemo } from "react";
import {
  Users,
  Coins
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
    return employeeSettings || {
      salaryPeriod: "monthly",
      salaryDueDay: 15,
      autoExpense: true,
      salaryTypes: [
        { id: "base", name: "Základná mzda", defaultAmount: 0 },
        { id: "bonus", name: "Prémie / Odmeny", defaultAmount: 0 },
        { id: "overtime", name: "Nadčasy", defaultAmount: 0 },
        { id: "reimbursement", name: "Cestovné / Diéty", defaultAmount: 0 }
      ],
      vacationTypes: [
        { id: "annual", name: "Dovolenka", defaultAllowance: 25, color: "#c29b62" },
        { id: "sick", name: "PN", defaultAllowance: 10, color: "#ef4444" },
        { id: "doctor", name: "Lekár", defaultAllowance: 7, color: "#3b82f6" },
        { id: "unpaid", name: "Neplatené voľno", defaultAllowance: 0, color: "#8b5cf6" }
      ]
    };
  }, [employeeSettings]);

  // Selected Employee object
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto">
      {/* Top Module Navigation Bar (when not in detail or when switching) */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          {/* Sub-view switcher tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedEmployeeId(null);
                setCurrentView("list");
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "list"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/30"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{t("Employees Directory", "Zoznam zamestnancov", "Munkatársak négyzete")}</span>
            </button>

            <button
              onClick={() => {
                setSelectedEmployeeId(null);
                setCurrentView("matrix");
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                currentView === "matrix"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/30"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>{t("Salaries Matrix", "Matica miezd", "Bérmátrix")}</span>
            </button>

            {currentView === "detail" && selectedEmployee && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-400">/</span>
                <span className="text-xs font-bold text-[#b58b4c] dark:text-[#d4af7a]">
                  {selectedEmployee.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6">
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
