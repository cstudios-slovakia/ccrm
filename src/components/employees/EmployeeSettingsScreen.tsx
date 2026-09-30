import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Settings,
  Clock,
  Coins,
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Briefcase,
  Save,
  Check,
  ChevronRight
} from "lucide-react";
import type { EmployeeSettings, FinancialCategory, SalaryTypeConfig, VacationTypeConfig } from "../../types";

interface EmployeeSettingsScreenProps {
  settings: EmployeeSettings;
  onSave: (updated: EmployeeSettings) => void;
  onCancel: () => void;
  financialCategories: FinancialCategory[];
  systemLanguage?: string;
}

export const EmployeeSettingsScreen: React.FC<EmployeeSettingsScreenProps> = ({
  settings,
  onSave,
  onCancel,
  financialCategories,
  systemLanguage = "sk"
}) => {
  const [activeTab, setActiveTab] = useState<"payroll" | "vacation" | "toggl">("payroll");

  // Local state initialized from settings
  const [salaryPeriod, setSalaryPeriod] = useState<"monthly" | "weekly">(settings.salaryPeriod || "monthly");
  const [salaryDueDay, setSalaryDueDay] = useState<number>(settings.salaryDueDay ?? 15);
  const [autoExpense, setAutoExpense] = useState<boolean>(!!settings.autoExpense);
  const [expenseCategoryId, setExpenseCategoryId] = useState<string>(settings.expenseCategoryId || "");

  const [salaryTypes, setSalaryTypes] = useState<SalaryTypeConfig[]>(settings.salaryTypes || [
    { id: "base", name: "Základná mzda", defaultAmount: 0 },
    { id: "bonus", name: "Prémie / Odmeny", defaultAmount: 0 },
    { id: "overtime", name: "Nadčasy", defaultAmount: 0 },
    { id: "reimbursement", name: "Cestovné / Diéty", defaultAmount: 0 }
  ]);

  const [vacationTypes, setVacationTypes] = useState<VacationTypeConfig[]>(settings.vacationTypes || [
    { id: "annual", name: "Dovolenka", defaultAllowance: 25, color: "#c29b62" },
    { id: "sick", name: "Práceneschopnosť (PN)", defaultAllowance: 10, color: "#ef4444" },
    { id: "doctor", name: "Lekár / Vyšetrenie", defaultAllowance: 7, color: "#3b82f6" },
    { id: "unpaid", name: "Neplatené voľno", defaultAllowance: 0, color: "#8b5cf6" }
  ]);

  const [togglApiKey, setTogglApiKey] = useState<string>(settings.togglApiKey || "");
  const [togglWorkspaceId, setTogglWorkspaceId] = useState<string>(settings.togglWorkspaceId || "");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Toggl test connection state
  const [testingToggl, setTestingToggl] = useState<boolean>(false);
  const [togglStatus, setTogglStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to save, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleTestToggl = async () => {
    if (!togglApiKey.trim()) {
      setTogglStatus({
        success: false,
        message: t("Please enter an API token first", "Najskôr zadajte API token", "Kérjük, előbb adja meg az API tokent")
      });
      return;
    }
    setTestingToggl(true);
    setTogglStatus(null);
    try {
      const res = await fetch(
        `/api/time_tracking.php?action=test_connection&api_key=${encodeURIComponent(togglApiKey)}&workspace_id=${encodeURIComponent(togglWorkspaceId)}`
      );
      const data = await res.json();
      if (data.success) {
        setTogglStatus({
          success: true,
          message: t(
            `Connected! User: ${data.data?.fullname || data.data?.email || "OK"} (${data.data?.workspaces?.length || 0} workspaces)`,
            `Pripojené! Používateľ: ${data.data?.fullname || data.data?.email || "OK"} (${data.data?.workspaces?.length || 0} pracovných priestorov)`,
            `Kapcsolódva! Felhasználó: ${data.data?.fullname || data.data?.email || "OK"} (${data.data?.workspaces?.length || 0} munkaterület)`
          )
        });
        if (!togglWorkspaceId && data.data?.defaultWorkspaceId) {
          setTogglWorkspaceId(String(data.data.defaultWorkspaceId));
        }
      } else {
        setTogglStatus({
          success: false,
          message: data.error || t("Connection failed", "Pripojenie zlyhalo", "Kapcsolódási hiba")
        });
      }
    } catch (err: any) {
      setTogglStatus({
        success: false,
        message: err.message || t("Network error", "Chyba siete", "Hálózati hiba")
      });
    } finally {
      setTestingToggl(false);
    }
  };

  const handleAddSalaryType = () => {
    const newId = `custom_${Date.now()}`;
    setSalaryTypes([
      ...salaryTypes,
      { id: newId, name: t("New Category", "Nová kategória", "Új kategória"), defaultAmount: 0 }
    ]);
  };

  const handleRemoveSalaryType = (id: string) => {
    setSalaryTypes(salaryTypes.filter((st) => st.id !== id));
  };

  const handleAddVacationType = () => {
    const newId = `vac_${Date.now()}`;
    setVacationTypes([
      ...vacationTypes,
      { id: newId, name: t("New Leave Type", "Nový typ voľna", "Új szabadságtípus"), defaultAllowance: 0, color: "#64748b" }
    ]);
  };

  const handleRemoveVacationType = (id: string) => {
    setVacationTypes(vacationTypes.filter((vt) => vt.id !== id));
  };

  const handleSave = () => {
    const updated: EmployeeSettings = {
      ...settings,
      salaryPeriod,
      salaryDueDay: Number(salaryDueDay) || 15,
      autoExpense,
      expenseCategoryId: expenseCategoryId || undefined,
      salaryTypes,
      vacationTypes,
      togglApiKey: togglApiKey.trim() || undefined,
      togglWorkspaceId: togglWorkspaceId.trim() || undefined
    };
    setIsSavedRecently(true);
    onSave(updated);
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 pb-16">
      {/* Top Breadcrumb & Action Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel border border-white/60 bg-white/95 shadow-glass text-slate-700 hover:text-slate-900 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("Back to Directory", "Späť na zoznam", "Vissza a listához")}</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-600 font-medium">
            {t("Employees & Payroll", "Zamestnanci a mzdy", "Alkalmazottak és bérek")}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[#b58b4c] font-bold">
            {t("Settings", "Nastavenia", "Beállítások")}
          </span>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-2xl glass-panel border border-white/60 bg-white/95 shadow-glass text-xs font-heading font-bold text-slate-700 hover:text-slate-900 hover:bg-white transition cursor-pointer"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSavedRecently}
            className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white font-heading font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#c29b62]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
          >
            {isSavedRecently ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>{t("Saved!", "Uložené!", "Mentve!")}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{t("Save Settings", "Uložiť nastavenia", "Beállítások mentése")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Screen Title Banner */}
      <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#c29b62] to-[#9e7638] text-white flex items-center justify-center shadow-lg shadow-[#c29b62]/30 shrink-0">
            <Settings className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight">
              {t("Employee & Payroll Settings", "Nastavenia zamestnancov a miezd", "Alkalmazotti és bérbeállítások")}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {t(
                "Configure company payroll periods, salary due dates, leave quota categories, and Toggl Track API integration",
                "Globálna perióda miezd, výplatný termín, kategórie absencií a prepojenie na Toggl Track",
                "Bérfizetési időszakok, kifizetési határidők, szabadságkategóriák és Toggl integráció"
              )}
            </p>
          </div>
        </div>

        {/* Tab Pills in Banner */}
        <div className="glass-panel p-1 rounded-2xl flex items-center gap-1 border border-white/60 bg-white/95 shadow-glass self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("payroll")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-all cursor-pointer ${
              activeTab === "payroll"
                ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{t("Payroll & Finances", "Mzdy a financie", "Bérek és pénzügyek")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("vacation")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-all cursor-pointer ${
              activeTab === "vacation"
                ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{t("Leave & Vacation Types", "Typy dovoleniek", "Szabadságtípusok")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("toggl")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-all cursor-pointer ${
              activeTab === "toggl"
                ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/25"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{t("Toggl Time Tracking", "Toggl meranie času", "Toggl időkövetés")}</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="space-y-6">
        {/* TAB 1: PAYROLL & FINANCES */}
        {activeTab === "payroll" && (
          <div className="space-y-6 animate-fade-in">
            {/* Top 2 Cards: Salary Period & Default Due Day */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Company Salary Period */}
              <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
                  <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-heading font-bold text-slate-900">
                      {t("Company Salary Period", "Perióda vyplácania miezd", "Bérfizetési időszak")}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {t("Default cycle for matrix columns and settlements", "Predvolený cyklus pre stĺpce matice a úhrady", "Alapértelmezett ciklus a bérmátrixban")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setSalaryPeriod("monthly")}
                    className={`p-3.5 rounded-2xl text-xs font-heading font-bold transition-all border cursor-pointer ${
                      salaryPeriod === "monthly"
                        ? "bg-[#c29b62] text-white border-[#c29b62] shadow-md shadow-[#c29b62]/25"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <span className="block text-sm">{t("Monthly", "Mesačne", "Havonta")}</span>
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">
                      {t("Jan - Dec (12 periods/year)", "Jan - Dec (12 periód ročne)", "Jan - Dec (12 időszak/év)")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSalaryPeriod("weekly")}
                    className={`p-3.5 rounded-2xl text-xs font-heading font-bold transition-all border cursor-pointer ${
                      salaryPeriod === "weekly"
                        ? "bg-[#c29b62] text-white border-[#c29b62] shadow-md shadow-[#c29b62]/25"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <span className="block text-sm">{t("Weekly", "Týždenne", "Hetente")}</span>
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">
                      {t("W1 - W52 (52 periods/year)", "T1 - T52 (52 periód ročne)", "H1 - H52 (52 időszak/év)")}
                    </span>
                  </button>
                </div>
              </div>

              {/* Default Salary Due Day */}
              <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
                  <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-heading font-bold text-slate-900">
                      {t("Default Salary Due Day", "Predvolený výplatný deň v mesiaci", "Alapértelmezett kifizetési nap")}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {t("Company standard due day of the following month", "Štandardný deň splatnosti mzdy nasledujúceho mesiaca", "Következő havi kifizetési határidő")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={salaryDueDay}
                      onChange={(e) => setSalaryDueDay(parseInt(e.target.value) || 15)}
                      className="w-28 px-4 py-2.5 text-base font-mono font-bold bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm text-center"
                    />
                  </div>
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold block text-slate-800">
                      {t(`${salaryDueDay}. day of the following month`, `${salaryDueDay}. deň nasledujúceho mesiaca`, `a következő hónap ${salaryDueDay}. napja`)}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {t("Can be customized per individual employee profile", "Možné individuálne upraviť v profile zamestnanca", "Alkalmazottanként egyénileg felülbírálható")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Auto-Expense Sync */}
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/60">
                <div>
                  <h3 className="text-sm font-heading font-bold text-slate-900">
                    {t("Auto-Sync Salaries to Financial Management", "Automatická synchronizácia miezd do financií", "Bérek automatikus szinkronizálása a Pénzügyekbe")}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t(
                      "Unpaid salaries are automatically registered as Planned Expenses; paid salaries as Paid Expenses",
                      "Nevyplatené mzdy sa zaevidujú ako Plánovaný výdavok; po úhrade ako Skutočný výdavok",
                      "A kifizetetlen bérek tervezett kiadásként, a kifizetettek valós kiadásként jelennek meg"
                    )}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={autoExpense}
                    onChange={(e) => setAutoExpense(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c29b62]"></div>
                </label>
              </div>

              {autoExpense && (
                <div className="pt-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t("Default Expense Category", "Predvolená kategória výdavku", "Alapértelmezett kiadási kategória")}
                  </label>
                  <select
                    value={expenseCategoryId}
                    onChange={(e) => setExpenseCategoryId(e.target.value)}
                    className="w-full sm:w-80 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium"
                  >
                    <option value="">{t("-- Select Financial Category --", "-- Vyberte finančnú kategóriu --", "-- Válasszon kategóriát --")}</option>
                    {financialCategories
                      .filter((c) => c.type === "expense")
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Salary Components & Categories */}
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                <div>
                  <h3 className="text-sm font-heading font-bold text-slate-900">
                    {t("Salary Components & Categories", "Zložky a kategórie mzdy", "Bérösszetevők és kategóriák")}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t(
                      "Configured categories appear in the monthly salaries matrix expander and slip generator",
                      "Tieto zložky sa zobrazujú v expanderi matice miezd a na výplatných páskach",
                      "Ezek az összetevők jelennek meg a havi bérmátrixban és a bérlapon"
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddSalaryType}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-heading font-bold rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white hover:shadow-md transition shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("Add Category", "Pridať zložku", "Összetevő hozzáadása")}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {salaryTypes.map((st, idx) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/60 transition"
                  >
                    <span className="text-xs font-mono font-bold text-slate-400 w-6 text-center">{idx + 1}.</span>
                    <input
                      type="text"
                      value={st.name}
                      onChange={(e) => {
                        const updated = [...salaryTypes];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setSalaryTypes(updated);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#c29b62] shadow-sm font-medium"
                      placeholder={t("Category Name", "Názov zložky", "Összetevő neve")}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSalaryType(st.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition cursor-pointer"
                      title={t("Delete", "Zmazať", "Törlés")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LEAVE & VACATION TYPES */}
        {activeTab === "vacation" && (
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-6 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
              <div>
                <h3 className="text-sm font-heading font-bold text-slate-900">
                  {t("Vacation & Absence Types", "Typy dovoleniek a neprítomností", "Szabadság- és távolléttípusok")}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {t(
                    "Define available leave categories, color tags, and default annual quotas in days",
                    "Definujte kategórie voľna, farebné označenie a predvolený ročný nárok v dňoch",
                    "Szabadságkategóriák, színjelölések és az éves alapkeret napokban"
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddVacationType}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-heading font-bold rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white hover:shadow-md transition shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("Add Leave Type", "Pridať typ voľna", "Típus hozzáadása")}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {vacationTypes.map((vt, idx) => (
                <div
                  key={vt.id}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/60 transition shadow-sm"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="color"
                      value={vt.color || "#c29b62"}
                      onChange={(e) => {
                        const updated = [...vacationTypes];
                        updated[idx] = { ...updated[idx], color: e.target.value };
                        setVacationTypes(updated);
                      }}
                      className="w-8 h-8 rounded-xl cursor-pointer border border-slate-200 bg-white p-0.5 shadow-sm shrink-0"
                      title={t("Pick color", "Vybrať farbu", "Szín kiválasztása")}
                    />
                    <input
                      type="text"
                      value={vt.name}
                      onChange={(e) => {
                        const updated = [...vacationTypes];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setVacationTypes(updated);
                      }}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#c29b62] shadow-sm font-medium"
                      placeholder={t("Leave Type Name", "Názov typu voľna", "Típus megnevezése")}
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {t("Quota:", "Základ:", "Keret:")}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={vt.defaultAllowance}
                        onChange={(e) => {
                          const updated = [...vacationTypes];
                          updated[idx] = { ...updated[idx], defaultAllowance: parseFloat(e.target.value) || 0 };
                          setVacationTypes(updated);
                        }}
                        className="w-14 px-1 py-0.5 text-sm bg-transparent font-mono font-bold text-slate-900 text-center focus:outline-none"
                      />
                      <span className="text-xs text-slate-400 font-bold">{t("d", "d", "n")}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveVacationType(vt.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition cursor-pointer"
                      title={t("Delete", "Zmazať", "Törlés")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: TOGGL TIME TRACKING */}
        {activeTab === "toggl" && (
          <div className="space-y-6 animate-fade-in">
            {/* Toggl Info Card */}
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-heading font-bold text-slate-900">
                    {t("Toggl Track v9 Integration", "Prepojenie s Toggl Track v9", "Toggl Track v9 Integráció")}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {t(
                      "Configure your Toggl Track API token to automatically sync monthly worked hours, project breakdowns, and weekly stats directly into each employee profile.",
                      "Zadajte svoj osobný API token z Toggl Track pre automatické načítavanie odpracovaných hodín, rozdelenia projektov a týždenných štatistík do profilov zamestnancov.",
                      "Adja meg a Toggl Track API tokent a havi munkaórák és projektek automatikus szinkronizálásához a munkatársak profiljába."
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Credentials Card */}
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* API Key */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t("Toggl API Token (Personal Access Token) *", "Toggl API Token (Osobný prístupový token) *", "Toggl API Token *")}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={togglApiKey}
                      onChange={(e) => setTogglApiKey(e.target.value)}
                      placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
                      className="w-full pl-4 pr-11 py-2.5 text-sm bg-white border border-slate-200 rounded-2xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {t("Find this in Toggl Track > Profile Settings > API Token", "Nájdete v Toggl Track > Nastavenia profilu > API Token", "Megtalálható a Toggl Track > Profilbeállítások > API Token menüben")}
                  </span>
                </div>

                {/* Workspace ID */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t("Workspace ID (Optional - auto-discovered if blank)", "Workspace ID (Voliteľné - automaticky zistí)", "Workspace ID (Opcionális)")}
                  </label>
                  <input
                    type="text"
                    value={togglWorkspaceId}
                    onChange={(e) => setTogglWorkspaceId(e.target.value)}
                    placeholder="e.g. 1234567"
                    className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-2xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {t("Leave blank to automatically connect to your default workspace", "Nechajte prázdne pre automatické pripojenie k predvolenému workspace", "Hagyja üresen az alapértelmezett munkaterülethez")}
                  </span>
                </div>
              </div>

              {/* Test Connection Button & Status */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={handleTestToggl}
                  disabled={testingToggl || !togglApiKey.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-heading font-bold rounded-2xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition shadow-md cursor-pointer uppercase tracking-wider"
                >
                  {testingToggl ? <Loader2 className="w-4 h-4 animate-spin text-[#c29b62]" /> : <Briefcase className="w-4 h-4" />}
                  <span>{t("Test Toggl Connection", "Otestovať pripojenie na Toggl", "Toggl kapcsolat tesztelése")}</span>
                </button>

                {togglStatus && (
                  <div
                    className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-2xl border ${
                      togglStatus.success
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                        : "bg-red-500/10 text-red-700 border-red-500/30"
                    }`}
                  >
                    {togglStatus.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    )}
                    <span>{togglStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM FIXED / STICKY ACTION BAR */}
        <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-4 px-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-heading font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {t("Press Ctrl+Enter to save", "Uložte stlačením Ctrl+Enter", "Mentés: Ctrl+Enter")}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSavedRecently}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white font-heading font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#c29b62]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
            >
              {isSavedRecently ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t("Saved!", "Uložené!", "Mentve!")}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{t("Save Settings", "Uložiť nastavenia", "Beállítások mentése")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSettingsScreen;
