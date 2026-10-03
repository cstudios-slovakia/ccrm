import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  User,
  MapPin,
  Clock,
  Coins,
  Calendar,
  FileText,
  Upload,
  Trash2,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2
} from "lucide-react";
import type { Employee, EmployeeFile, EmployeeSettings, FinancialCategory } from "../../types";

interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee?: Employee | null;
  onSave: (employee: Employee) => void;
  settings: EmployeeSettings;
  financialCategories: FinancialCategory[];
  systemLanguage?: string;
  systemCurrency?: string;
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSave,
  settings,
  financialCategories,
  systemLanguage = "sk",
  systemCurrency = "€"
}) => {
  const isEditing = !!employee;

  // Form State
  const [name, setName] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const [addressStreet, setAddressStreet] = useState<string>("");
  const [addressCity, setAddressCity] = useState<string>("");
  const [addressZip, setAddressZip] = useState<string>("");
  const [addressCountry, setAddressCountry] = useState<string>("Slovakia");

  const [salaryType, setSalaryType] = useState<"monthly" | "daily" | "hourly">("monthly");
  const [salaryAmount, setSalaryAmount] = useState<number>(0);
  const [salaryDueDay, setSalaryDueDay] = useState<string>("");

  const [vacationAllowances, setVacationAllowances] = useState<Record<string, number>>({});

  const [timeTrackingUserId, setTimeTrackingUserId] = useState<string>("");
  const [timeTrackingUserName, setTimeTrackingUserName] = useState<string>("");

  const [autoExpense, setAutoExpense] = useState<boolean>(true);
  const [expenseCategoryId, setExpenseCategoryId] = useState<string>("");

  const [files, setFiles] = useState<EmployeeFile[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);

  // Toggl workspace users list
  const [togglUsers, setTogglUsers] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [loadingTogglUsers, setLoadingTogglUsers] = useState<boolean>(false);
  const [togglFetchError, setTogglFetchError] = useState<string | null>(null);

  // File uploading state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  // Populate form on edit or open
  useEffect(() => {
    if (employee) {
      setName(employee.name || "");
      setPin(employee.pin || "");
      setEmail(employee.email || "");
      setPhone(employee.phone || "");

      setAddressStreet(employee.addressStreet || "");
      setAddressCity(employee.addressCity || "");
      setAddressZip(employee.addressZip || "");
      setAddressCountry(employee.addressCountry || "Slovakia");

      setSalaryType(employee.salaryType || "monthly");
      setSalaryAmount(employee.salaryAmount || 0);
      setSalaryDueDay(employee.salaryDueDay !== null && employee.salaryDueDay !== undefined ? String(employee.salaryDueDay) : "");

      setVacationAllowances(employee.vacationAllowances || {});

      setTimeTrackingUserId(employee.timeTrackingUserId ? String(employee.timeTrackingUserId) : "");
      setTimeTrackingUserName(employee.timeTrackingUserName || "");

      setAutoExpense(employee.autoExpense !== undefined ? !!employee.autoExpense : !!settings.autoExpense);
      setExpenseCategoryId(employee.expenseCategoryId || settings.expenseCategoryId || "");

      setFiles(employee.files || []);
      setNotes(employee.notes || "");
      setIsActive(employee.isActive !== undefined ? !!employee.isActive : true);
    } else {
      // Default blank form
      setName("");
      setPin("");
      setEmail("");
      setPhone("");

      setAddressStreet("");
      setAddressCity("");
      setAddressZip("");
      setAddressCountry("Slovakia");

      setSalaryType("monthly");
      setSalaryAmount(0);
      setSalaryDueDay("");

      // Initialize default allowances from settings
      const defAllowances: Record<string, number> = {};
      if (settings.vacationTypes && settings.vacationTypes.length > 0) {
        settings.vacationTypes.forEach((vt) => {
          defAllowances[vt.id] = vt.defaultAllowance ?? vt.defaultDays ?? 0;
        });
      } else {
        defAllowances["annual"] = 25;
        defAllowances["sick"] = 10;
        defAllowances["doctor"] = 7;
      }
      setVacationAllowances(defAllowances);

      setTimeTrackingUserId("");
      setTimeTrackingUserName("");

      setAutoExpense(settings.autoExpense !== undefined ? !!settings.autoExpense : true);
      setExpenseCategoryId(settings.expenseCategoryId || "");

      setFiles([]);
      setNotes("");
      setIsActive(true);
    }
  }, [employee, settings, isOpen]);

  // Check if Toggl API key is configured
  const hasTogglKey = useMemo(() => {
    const rawKey = settings.togglApiKey || settings.timeTracking?.togglApiToken;
    if (!rawKey || typeof rawKey !== "string") return false;
    const trimmed = rawKey.trim();
    return (
      trimmed.length > 0 &&
      trimmed !== "9c8a1b2e3d4f5g6h7i8j9k0l" &&
      trimmed !== "test_dummy_token"
    );
  }, [settings.togglApiKey, settings.timeTracking?.togglApiToken]);

  // Fetch Toggl workspace users if modal is open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingTogglUsers(true);
    setTogglFetchError(null);

    fetch(`/api/time_tracking.php?action=fetch_workspace_users`, { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!isMounted) return;
        const usersList = Array.isArray(data.data) ? data.data : (Array.isArray(data.users) ? data.users : []);
        if (data.success && usersList.length > 0) {
          const sorted = [...usersList].sort((a, b) => {
            const aActive = a.active !== false;
            const bActive = b.active !== false;
            if (aActive !== bActive) return aActive ? -1 : 1;
            const nameA = (a.name || a.email || "").toLowerCase();
            const nameB = (b.name || b.email || "").toLowerCase();
            return nameA.localeCompare(nameB);
          });
          setTogglUsers(sorted);
        } else if (hasTogglKey) {
          setTogglFetchError(data.error || data.message || null);
        }
      })
      .catch((err) => {
        if (isMounted && hasTogglKey) setTogglFetchError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoadingTogglUsers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, hasTogglKey]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const file = fileList[0];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("module", "employees");
      formData.append("eventId", `emp_contract_${Date.now()}`);

      const res = await fetch("/upload.php", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || t("Upload failed", "Nahrávanie zlyhalo", "Feltöltés sikertelen"));
      }

      const data = await res.json();
      if (data.success) {
        const newFile: EmployeeFile = {
          id: `file_${Date.now()}`,
          name: data.fileName || file.name,
          url: data.filePath || `/uploads/employees/${data.fileName}`,
          size: file.size,
          type: file.type || "application/octet-stream",
          uploadedAt: new Date().toISOString()
        };
        setFiles((prev) => [...prev, newFile]);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles(files.filter((f) => f.id !== fileId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const empId = employee?.id || `emp_${Date.now()}`;
    const updatedEmployee: Employee = {
      ...employee,
      id: empId,
      name: name.trim(),
      pin: pin.trim(),
      email: email.trim(),
      phone: phone.trim(),
      addressStreet: addressStreet.trim(),
      addressCity: addressCity.trim(),
      addressZip: addressZip.trim(),
      addressCountry: addressCountry.trim() || "Slovakia",
      salaryType,
      salaryAmount: Number(salaryAmount) || 0,
      salaryDueDay: salaryDueDay.trim() ? Number(salaryDueDay) : null,
      vacationAllowances,
      timeTrackingProvider: "toggl",
      timeTrackingUserId: timeTrackingUserId || null,
      timeTrackingUserName: timeTrackingUserName || null,
      autoExpense,
      expenseCategoryId: expenseCategoryId || null,
      files,
      notes: notes.trim(),
      isActive,
      updatedAt: new Date().toISOString(),
      createdAt: employee?.createdAt || new Date().toISOString()
    };

    onSave(updatedEmployee);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-[#c29b62]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#c29b62] text-white flex items-center justify-center shadow-md shadow-[#c29b62]/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-title font-bold text-slate-900">
                {isEditing
                  ? t("Edit Employee Profile", "Úprava profilu zamestnanca", "Alkalmazotti profil szerkesztése")
                  : t("Add New Employee", "Nový zamestnanec", "Új alkalmazott")}
              </h2>
              <p className="text-ui text-slate-500">
                {t(
                  "Manage personal data, compensation rate, time tracking & contract documents",
                  "Osobné údaje, mzda, meranie času a pracovné zmluvy",
                  "Személyes adatok, bér, időkövetés és munkaszerződések"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECTION 1: Personal & Identification */}
          <div className="space-y-4">
            <h3 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
              <User className="w-4 h-4" />
              {t("Personal & Contact Information", "Osobné a kontaktné údaje", "Személyes és elérhetőségi adatok")}
            </h3>

            <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-4">
              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Full Name *", "Meno a priezvisko *", "Teljes név *")}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ján Novák"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Personal ID / PIN (Rodné číslo)", "Rodné číslo / IČO", "Személyi azonosító")}
                </label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="e.g. 900101/1234"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Email Address", "Emailová adresa", "E-mail cím")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan.novak@example.com"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Phone Number", "Telefónne číslo", "Telefonszám")}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+421 900 123 456"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Permanent Address */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {t("Permanent Address", "Trvalé bydlisko", "Állandó lakcím")}
            </h3>

            <div className="grid grid-cols-1 ws-md:grid-cols-4 gap-4">
              <div className="ws-md:col-span-2">
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Street & Number", "Ulica a číslo", "Utca és házszám")}
                </label>
                <input
                  type="text"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  placeholder="Hlavná 123/4"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("City", "Mesto / Obec", "Város")}
                </label>
                <input
                  type="text"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="Bratislava"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Postal / ZIP Code", "PSČ", "Irányítószám")}
                </label>
                <input
                  type="text"
                  value={addressZip}
                  onChange={(e) => setAddressZip(e.target.value)}
                  placeholder="811 01"
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Compensation & Due Day */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
              <Coins className="w-4 h-4" />
              {t("Salary & Compensation", "Mzda a odmeňovanie", "Bér és juttatások")}
            </h3>

            <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-4">
              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("Salary Type", "Typ mzdy", "Bér típusa")}
                </label>
                <select
                  value={salaryType}
                  onChange={(e) => setSalaryType(e.target.value as any)}
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                >
                  <option value="monthly">{t("Monthly (Mesačná)", "Mesačná", "Havi")}</option>
                  <option value="daily">{t("Daily (Denná)", "Denná", "Napi")}</option>
                  <option value="hourly">{t("Hourly (Hodinová)", "Hodinová", "Órabér")}</option>
                </select>
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(`Rate / Amount (${systemCurrency})`, `Základná sadzba (${systemCurrency})`, `Alapbér összege (${systemCurrency})`)}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={salaryAmount}
                  onChange={(e) => setSalaryAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>

              <div>
                <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t(
                    `Salary Due Day (Default: ${settings.salaryDueDay ?? 15})`,
                    `Výplatný deň (Predvolený: ${settings.salaryDueDay ?? 15}.)`,
                    `Kifizetés napja (Alap: ${settings.salaryDueDay ?? 15}.)`
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={salaryDueDay}
                  onChange={(e) => setSalaryDueDay(e.target.value)}
                  placeholder={String(settings.salaryDueDay ?? 15)}
                  className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                />
              </div>
            </div>

            {/* Financial auto-expense toggle & category */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
              <div>
                <span className="text-ui font-semibold text-slate-800 dark:text-slate-200 block">
                  {t("Auto-sync payout to Financial Records", "Automaticky evidovať výplatu do nákladov", "Kifizetés automatikus rögzítése kiadásként")}
                </span>
                <span className="text-ui text-slate-500 dark:text-slate-400">
                  {t(
                    "Creates planned expense when unpaid, paid expense when settled",
                    "Vytvorí plánovaný výdavok pri nevyplatení, skutočný pri úhrade",
                    "Kifizetetlen állapotban tervezett, rendezéskor valós kiadás"
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoExpense}
                    onChange={(e) => setAutoExpense(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c29b62]"></div>
                </label>

                {autoExpense && (
                  <select
                    value={expenseCategoryId}
                    onChange={(e) => setExpenseCategoryId(e.target.value)}
                    className="px-2.5 py-1 text-ui bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="">{t("Default Category", "Predvolená kategória", "Alapértelmezett kategória")}</option>
                    {financialCategories
                      .filter((c) => c.type === "expense")
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4: Time Tracking Mapping (Toggl) */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {t("Toggl Track User Mapping", "Prepojenie s používateľom v Toggl", "Toggl felhasználó összerendelés")}
            </h3>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
              {loadingTogglUsers ? (
                <div className="flex items-center gap-2 text-ui text-slate-500 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-[#c29b62]" />
                  <span>{t("Loading workspace users from Toggl...", "Načítavam používateľov z Toggl...", "Felhasználók betöltése a Toggl-ből...")}</span>
                </div>
              ) : togglUsers.length > 0 ? (
                <div>
                  <label className="block text-ui font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t("Select Mapped Toggl User", "Vyberte používateľa v Toggl", "Válasszon Toggl felhasználót")}
                  </label>
                  <select
                    value={timeTrackingUserId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setTimeTrackingUserId(selectedId);
                      const found = togglUsers.find((u) => String(u.id) === selectedId);
                      setTimeTrackingUserName(found ? found.name || found.email : "");
                    }}
                    className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
                  >
                    <option value="">{t("-- Not mapped / Unlinked --", "-- Bez prepojenia na Toggl --", "-- Nincs összerendelve --")}</option>
                    {togglUsers.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name || u.email} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-ui text-slate-500 dark:text-slate-400">
                    {hasTogglKey
                      ? t(
                          "No users loaded or manual mapping:",
                          "Žiadni používatelia alebo manuálne zadanie:",
                          "Nincsenek betöltött felhasználók vagy kézi megadás:"
                        )
                      : t(
                          "Toggl API token not configured in Settings",
                          "Toggl API token nie je nastavený v Nastaveniach",
                          "A Toggl API token nincs beállítva a Beállításokban"
                        )}
                  </div>
                  <input
                    type="text"
                    value={timeTrackingUserId}
                    onChange={(e) => setTimeTrackingUserId(e.target.value)}
                    placeholder={t("Toggl User ID (manual)", "Toggl User ID (manuálne)", "Toggl User ID (kézi)")}
                    className="w-48 px-3 py-1.5 text-ui bg-white border border-slate-200 rounded-lg text-slate-900 font-mono"
                  />
                </div>
              )}

              {togglFetchError && (
                <div className="p-2 rounded-lg bg-red-50 text-red-600 text-ui flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{togglFetchError}</span>
                </div>
              )}

              {timeTrackingUserId && (
                <div className="flex items-center gap-1.5 text-ui text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {t(
                      `Linked to Toggl User ID: ${timeTrackingUserId}`,
                      `Prepojené s Toggl používateľom: ${timeTrackingUserName || timeTrackingUserId}`,
                      `Összerendelve Toggl fiókkal: ${timeTrackingUserName || timeTrackingUserId}`
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 5: Vacation & Leave Allowances */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <h3 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {t("Vacation Allowances (Days / Year)", "Ročný nárok na voľno (Dni / Rok)", "Szabadságkeret (Nap / Év)")}
            </h3>

            <div className="grid grid-cols-2 ws-sm:grid-cols-4 gap-3">
              {(settings.vacationTypes && settings.vacationTypes.length > 0
                ? settings.vacationTypes
                : [
                    { id: "annual", name: "Dovolenka", defaultAllowance: 25 },
                    { id: "sick", name: "PN", defaultAllowance: 10 },
                    { id: "doctor", name: "Lekár", defaultAllowance: 7 },
                    { id: "unpaid", name: "Neplatené", defaultAllowance: 0 }
                  ]
              ).map((vt) => (
                <div key={vt.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="block text-ui font-medium text-slate-600 truncate mb-1">
                    {vt.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={vacationAllowances[vt.id] !== undefined ? vacationAllowances[vt.id] : vt.defaultAllowance}
                      onChange={(e) =>
                        setVacationAllowances({
                          ...vacationAllowances,
                          [vt.id]: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-body bg-white border border-slate-200 rounded-lg text-slate-900 font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#c29b62]"
                    />
                    <span className="text-ui text-slate-400">{t("d", "d", "n")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 6: Contracts & File Attachments */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t("Contracts & Uploaded Documents", "Zmluvy a dokumenty zamestnanca", "Szerződések és dokumentumok")}
              </h3>

              <label className="flex items-center gap-1.5 px-3 py-1.5 text-ui font-semibold rounded-lg bg-[#c29b62] text-white hover:bg-[#b58b4c] cursor-pointer shadow-sm transition">
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{isUploading ? t("Uploading...", "Nahrávam...", "Feltöltés...") : t("Upload Contract", "Nahrať zmluvu", "Szerződés feltöltése")}</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                />
              </label>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-ui flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {files.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-ui text-slate-400">
                {t("No contracts or files attached yet.", "Zatiaľ neboli nahraté žiadne zmluvy ani dokumenty.", "Még nincsenek csatolt dokumentumok.")}
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#c29b62]/15 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-ui font-semibold text-slate-900 truncate">{file.name}</p>
                        <p className="text-micro text-slate-400">
                          {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""} •{" "}
                          {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md transition"
                        title={t("Download / View", "Stiahnuť / Zobraziť", "Letöltés / Megtekintés")}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-md transition"
                        title={t("Remove file", "Odstrániť súbor", "Fájl törlése")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 7: Notes & Status */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-ui font-medium text-slate-700 mb-1">
                {t("Internal Notes & Observations", "Interné poznámky", "Belső feljegyzések")}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("Notes, qualifications, workstation details...", "Poznámky, kvalifikácia, pracovné miesto...", "Jegyzetek, képesítések, munkakör...")}
                className="w-full px-3 py-2 text-body bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-ui font-semibold text-slate-800">
                {t("Active Employee Status", "Aktívny stav zamestnanca", "Aktív alkalmazotti státusz")}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>
        </form>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-body font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 text-body font-semibold text-white bg-[#c29b62] hover:bg-[#b58b4c] rounded-xl shadow-md shadow-[#c29b62]/30 transition"
          >
            {isEditing ? t("Save Changes", "Uložiť zmeny", "Módosítások mentése") : t("Create Employee", "Vytvoriť zamestnanca", "Alkalmazott létrehozása")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeFormModal;
