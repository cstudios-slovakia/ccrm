import React, { useState } from "react";
import { entityAccentStyle } from "../../utils/entityAccent";
import {
  X,
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
  Briefcase
} from "lucide-react";
import type { EmployeeSettings, FinancialCategory, SalaryTypeConfig, VacationTypeConfig } from "../../types";
import { ColorPicker } from "../ui/ColorPicker";
import { nextDiscreetColor } from "../../utils/color";

interface EmployeeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EmployeeSettings;
  onSave: (updated: EmployeeSettings) => void;
  financialCategories: FinancialCategory[];
  systemLanguage?: string;
}

export const EmployeeSettingsModal: React.FC<EmployeeSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
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

  const sanitizeKey = (k?: string) => {
    if (!k || k === "9c8a1b2e3d4f5g6h7i8j9k0l" || k === "test_dummy_token") return "";
    return k;
  };

  const [togglApiKey, setTogglApiKey] = useState<string>(() =>
    sanitizeKey(settings.togglApiKey || settings.timeTracking?.togglApiToken)
  );
  const [togglWorkspaceId, setTogglWorkspaceId] = useState<string>(
    settings.togglWorkspaceId || settings.timeTracking?.togglWorkspaceId || ""
  );
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Toggl test connection state
  const [testingToggl, setTestingToggl] = useState<boolean>(false);
  const [togglStatus, setTogglStatus] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

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
      const res = await fetch("/api/time_tracking.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "test_connection",
          api_token: togglApiKey.trim(),
          api_key: togglApiKey.trim(),
          workspace_id: togglWorkspaceId.trim(),
          provider: "toggl"
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        const userName = data.user?.name || data.data?.fullname || data.data?.user?.name || "OK";
        const wsList = data.workspaces || data.data?.workspaces || [];
        setTogglStatus({
          success: true,
          message: data.message || t(
            `Connected! User: ${userName} (${wsList.length} workspaces)`,
            `Pripojené! Používateľ: ${userName} (${wsList.length} pracovných priestorov)`,
            `Kapcsolódva! Felhasználó: ${userName} (${wsList.length} munkaterület)`
          )
        });
        if (!togglWorkspaceId && (data.user?.default_workspace_id || data.data?.defaultWorkspaceId)) {
          setTogglWorkspaceId(String(data.user?.default_workspace_id || data.data?.defaultWorkspaceId));
        }
      } else {
        setTogglStatus({
          success: false,
          message: data.error || data.message || t("Connection failed", "Pripojenie zlyhalo", "Kapcsolódási hiba")
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
    const usedColors = vacationTypes.map((v) => v.color).filter(Boolean);
    setVacationTypes([
      ...vacationTypes,
      {
        id: newId,
        name: t("New Leave Type", "Nový typ voľna", "Új szabadságtípus"),
        defaultAllowance: 0,
        color: nextDiscreetColor(usedColors)
      }
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
      togglWorkspaceId: togglWorkspaceId.trim() || undefined,
      timeTracking: togglApiKey.trim() ? {
        provider: "toggl",
        togglApiToken: togglApiKey.trim(),
        togglWorkspaceId: togglWorkspaceId.trim()
      } : undefined
    };
    onSave(updated);
    onClose();
  };

  return (
    <div style={entityAccentStyle("employees") as React.CSSProperties} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-entity-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-entity-solid text-white flex items-center justify-center shadow-2xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-title font-bold text-gray-900">
                {t("Employee & Payroll Settings", "Nastavenia zamestnancov a miezd", "Alkalmazotti és bérbeállítások")}
              </h2>
              <p className="text-ui text-gray-500">
                {t("Configure salary cycles, leave types, and Toggl integration", "Konfigurácia cyklov miezd, typov voľna a Toggl prepojenia", "Bérciklusok, szabadságtípusok és Toggl integráció")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-gray-200 bg-gray-50/70">
          <button
            onClick={() => setActiveTab("payroll")}
            className={`flex items-center gap-2 px-4 py-2.5 text-body font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === "payroll"
                ? "border-[#c29b62] text-[#9e7638] bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Coins className="w-4 h-4" />
            {t("Payroll & Finances", "Mzdy a financie", "Bérek és pénzügyek")}
          </button>

          <button
            onClick={() => setActiveTab("vacation")}
            className={`flex items-center gap-2 px-4 py-2.5 text-body font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === "vacation"
                ? "border-[#c29b62] text-[#9e7638] bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Calendar className="w-4 h-4" />
            {t("Leave & Vacation Types", "Typy dovoleniek", "Szabadságtípusok")}
          </button>

          <button
            onClick={() => setActiveTab("toggl")}
            className={`flex items-center gap-2 px-4 py-2.5 text-body font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === "toggl"
                ? "border-[#c29b62] text-[#9e7638] bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Clock className="w-4 h-4" />
            {t("Toggl Time Tracking", "Toggl meranie času", "Toggl időkövetés")}
          </button>
        </div>

        {/* Modal content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PAYROLL */}
          {activeTab === "payroll" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-4">
                {/* Salary Period */}
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <label className="block text-ui font-semibold text-gray-500 mb-2">
                    {t("Company Salary Period", "Perióda vyplácania miezd", "Bérfizetési időszak")}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSalaryPeriod("monthly")}
                      className={`px-3 py-2 rounded-md text-body font-medium border transition ${
                        salaryPeriod === "monthly"
                          ? "bg-[#c29b62] text-white border-[#c29b62] shadow-sm"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      {t("Monthly", "Mesačne", "Havonta")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalaryPeriod("weekly")}
                      className={`px-3 py-2 rounded-md text-body font-medium border transition ${
                        salaryPeriod === "weekly"
                          ? "bg-[#c29b62] text-white border-[#c29b62] shadow-sm"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      {t("Weekly", "Týždenne", "Hetente")}
                    </button>
                  </div>
                </div>

                {/* Default Salary Due Day */}
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <label className="block text-ui font-semibold text-gray-500 mb-2">
                    {t("Default Salary Due Day", "Predvolený výplatný deň v mesiaci", "Alapértelmezett kifizetési nap")}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={salaryDueDay}
                      onChange={(e) => setSalaryDueDay(parseInt(e.target.value) || 15)}
                      className="w-24 px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                    />
                    <span className="text-ui text-gray-500">
                      {t("day of the following month (e.g. 15th)", "deň nasledujúceho mesiaca (napr. 15.)", "a következő hónap napja (pl. 15.)")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Auto-Expense Sync */}
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-body font-semibold text-gray-900">
                      {t("Auto-Sync Salaries to Financial Management", "Automatická synchronizácia miezd do financií", "Bérek automatikus szinkronizálása")}
                    </h4>
                    <p className="text-ui text-gray-500 mt-0.5">
                      {t(
                        "Unpaid salaries are automatically registered as Planned Expenses; paid salaries as Paid Expenses",
                        "Nevyplatené mzdy sa zaevidujú ako Plánovaný výdavok; po úhrade ako Skutočný výdavok",
                        "A kifizetetlen bérek tervezett kiadásként, a kifizetettek valós kiadásként jelennek meg"
                      )}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoExpense}
                      onChange={(e) => setAutoExpense(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c29b62]"></div>
                  </label>
                </div>

                {autoExpense && (
                  <div className="pt-2 border-t border-gray-200">
                    <label className="block text-ui font-semibold text-gray-600 mb-1">
                      {t("Default Expense Category", "Predvolená kategória výdavku", "Alapértelmezett kiadási kategória")}
                    </label>
                    <select
                      value={expenseCategoryId}
                      onChange={(e) => setExpenseCategoryId(e.target.value)}
                      className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
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

              {/* Salary Categories / Components */}
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-body font-semibold text-gray-900">
                      {t("Salary Components & Categories", "Zložky a kategórie mzdy", "Bérösszetevők és kategóriák")}
                    </h4>
                    <p className="text-ui text-gray-500">
                      {t(
                        "Configured categories appear in the monthly salaries matrix table",
                        "Tieto zložky sa zobrazujú v matici miezd",
                        "Ezek az összetevők jelennek meg a bérmátrixban"
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSalaryType}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-ui font-semibold rounded-md bg-[#c29b62] text-white hover:bg-[#b58b4c] transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t("Add Category", "Pridať zložku", "Összetevő hozzáadása")}
                  </button>
                </div>

                <div className="space-y-2 mt-2">
                  {salaryTypes.map((st, idx) => (
                    <div
                      key={st.id}
                      className="flex items-center gap-3 p-2.5 rounded-md bg-white border border-gray-200"
                    >
                      <span className="text-ui font-mono text-gray-400 w-5 text-center">{idx + 1}.</span>
                      <input
                        type="text"
                        value={st.name}
                        onChange={(e) => {
                          const updated = [...salaryTypes];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setSalaryTypes(updated);
                        }}
                        className="flex-1 px-3 py-1.5 text-body bg-transparent border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
                        placeholder={t("Category Name", "Názov zložky", "Összetevő neve")}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSalaryType(st.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition"
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

          {/* TAB 2: VACATION */}
          {activeTab === "vacation" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-body font-semibold text-gray-900">
                    {t("Vacation & Absence Types", "Typy dovoleniek a neprítomností", "Szabadság- és távolléttípusok")}
                  </h4>
                  <p className="text-ui text-gray-500">
                    {t(
                      "Define available leave types and their default yearly allowance in days",
                      "Definujte typy voľna a ich predvolený ročný nárok v dňoch",
                      "Adja meg a szabadságtípusokat és az éves alapkeretet napokban"
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddVacationType}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-ui font-semibold rounded-md bg-[#c29b62] text-white hover:bg-[#b58b4c] transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("Add Leave Type", "Pridať typ voľna", "Típus hozzáadása")}
                </button>
              </div>

              <div className="space-y-3">
                {vacationTypes.map((vt, idx) => (
                  <div
                    key={vt.id}
                    className="flex flex-col ws-sm:flex-row ws-sm:items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <ColorPicker
                        variant="pill"
                        value={vt.color || "#c29b62"}
                        fallback="#c29b62"
                        onChange={(color) => {
                          const updated = [...vacationTypes];
                          updated[idx] = { ...updated[idx], color };
                          setVacationTypes(updated);
                        }}
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
                        className="flex-1 px-3 py-1.5 text-body bg-transparent border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
                        placeholder={t("Leave Type Name", "Názov typu voľna", "Típus megnevezése")}
                      />
                    </div>

                    <div className="flex items-center gap-3 justify-end">
                      <div className="flex items-center gap-1.5">
                        <span className="text-ui text-gray-500">
                          {t("Default Days:", "Základ:", "Alapkeret:")}
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
                          className="w-16 px-2 py-1 text-body bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
                        />
                        <span className="text-ui text-gray-400">{t("days", "dní", "nap")}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveVacationType(vt.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition"
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

          {/* TAB 3: TOGGL */}
          {activeTab === "toggl" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-lg bg-entity-subtle border border-entity-border flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#9e7638] shrink-0 mt-0.5" />
                <div className="text-ui text-gray-700 space-y-1">
                  <p className="font-semibold text-gray-900">
                    {t("Toggl Track v9 Integration", "Prepojenie s Toggl Track v9", "Toggl Track v9 Integráció")}
                  </p>
                  <p>
                    {t(
                      "Enter your Toggl Track API token to pull monthly worked hours for each employee directly into their detail profile.",
                      "Zadajte svoj API token z Toggl Track pre automatické načítavanie odpracovaných hodín zamestnancov.",
                      "Adja meg a Toggl Track API tokent a havi munkaórák automatikus betöltéséhez az alkalmazottak profiljába."
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* API Key */}
                <div>
                  <label className="block text-ui font-semibold text-gray-500 mb-1.5">
                    {t("Toggl API Token", "Toggl API Token", "Toggl API Token")}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={togglApiKey}
                      onChange={(e) => setTogglApiKey(e.target.value)}
                      placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
                      className="w-full pl-3 pr-10 py-2.5 text-body bg-white border border-gray-200 rounded-md text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Workspace ID */}
                <div>
                  <label className="block text-ui font-semibold text-gray-500 mb-1.5">
                    {t("Workspace ID (Optional - auto-discovered if blank)", "Workspace ID (Voliteľné - automaticky zistí ak je prázdne)", "Workspace ID (Opcionális)")}
                  </label>
                  <input
                    type="text"
                    value={togglWorkspaceId}
                    onChange={(e) => setTogglWorkspaceId(e.target.value)}
                    placeholder="e.g. 1234567"
                    className="w-full px-3 py-2.5 text-body bg-white border border-gray-200 rounded-md text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                  />
                </div>

                {/* Test Connection Button */}
                <div className="pt-2 flex flex-col ws-sm:flex-row items-start ws-sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestToggl}
                    disabled={testingToggl || !togglApiKey.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-body font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition shadow-sm"
                  >
                    {testingToggl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                    {t("Test Toggl Connection", "Otestovať pripojenie", "Kapcsolat tesztelése")}
                  </button>

                  {togglStatus && (
                    <div
                      className={`flex items-center gap-2 text-ui font-medium px-3 py-1.5 rounded-lg ${
                        togglStatus.success
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-600 border border-red-500/20"
                      }`}
                    >
                      {togglStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      )}
                      <span>{togglStatus.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-body font-semibold text-gray-700 hover:bg-gray-200/60 rounded-md transition"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-body font-semibold text-white bg-[#c29b62] hover:bg-[#b58b4c] rounded-md shadow-md shadow-2xs transition"
          >
            {t("Save Settings", "Uložiť nastavenia", "Beállítások mentése")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSettingsModal;
