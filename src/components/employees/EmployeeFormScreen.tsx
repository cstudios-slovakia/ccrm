import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "../layout";
import {
  ArrowLeft,
  User,
  UserPlus,
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
  CheckCircle2,
  Save,
  Mail,
  Phone,
  Check,
  ChevronRight
} from "lucide-react";
import type { Employee, EmployeeFile, EmployeeSettings, FinancialCategory } from "../../types";

interface EmployeeFormScreenProps {
  employee?: Employee | null;
  onSave: (employee: Employee) => void;
  onCancel: () => void;
  settings: EmployeeSettings;
  financialCategories: FinancialCategory[];
  systemLanguage?: string;
  systemCurrency?: string;
}

export const EmployeeFormScreen: React.FC<EmployeeFormScreenProps> = ({
  employee,
  onSave,
  onCancel,
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

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

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
  }, [employee, settings]);

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

  // Fetch Toggl workspace users if credentials exist
  useEffect(() => {
    if (!hasTogglKey) return;

    let isMounted = true;
    setLoadingTogglUsers(true);
    setTogglFetchError(null);

    fetch(`/api/time_tracking.php?action=fetch_workspace_users`, { credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!isMounted) return;
        const usersList = Array.isArray(data.data) ? data.data : (Array.isArray(data.users) ? data.users : []);
        if (data.success && usersList.length > 0) {
          setTogglUsers(usersList);
        } else {
          setTogglFetchError(data.error || data.message || null);
        }
      })
      .catch((err) => {
        if (isMounted) setTogglFetchError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoadingTogglUsers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasTogglKey]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to save, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!name.trim()) {
      setValidationError(
        t("Please enter the employee's full name", "Zadajte prosím meno a priezvisko zamestnanca", "Kérjük, adja meg az alkalmazott teljes nevét")
      );
      return;
    }
    setValidationError(null);

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

    setIsSavedRecently(true);
    onSave(updatedEmployee);
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 pb-16">
      {/* Top Breadcrumb & Action Navigation Bar */}
      <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-2 text-ui font-semibold text-slate-500">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel border border-white/60 bg-white/95 shadow-glass text-slate-700 hover:text-slate-900 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>
              {isEditing
                ? t("Back to Employee", "Späť na zamestnanca", "Vissza az alkalmazotthoz")
                : t("Back to Directory", "Späť na zoznam", "Vissza a listához")}
            </span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-600 font-medium">
            {t("Employees", "Zamestnanci", "Alkalmazottak")}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[#b58b4c] font-bold">
            {isEditing ? employee.name : t("New Employee", "Nový zamestnanec", "Új alkalmazott")}
          </span>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-2xl glass-panel border border-white/60 bg-white/95 shadow-glass text-ui font-heading font-bold text-slate-700 hover:text-slate-900 hover:bg-white transition cursor-pointer"
          >
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSavedRecently}
            className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white font-heading font-bold text-ui shadow-lg shadow-[#c29b62]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
          >
            {isSavedRecently ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>{t("Saved!", "Uložené!", "Mentve!")}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>
                  {isEditing
                    ? t("Save Changes", "Uložiť zmeny", "Módosítások mentése")
                    : t("Create Employee", "Vytvoriť zamestnanca", "Alkalmazott létrehozása")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Screen title (docs/VIEW-SIZE.md §6.2) */}
      <PageHeader
        icon={isEditing ? <User className="text-[#9e7638]" /> : <UserPlus className="text-[#9e7638]" />}
        title={isEditing
          ? t(`Edit Employee: ${employee.name}`, `Úprava zamestnanca: ${employee.name}`, `Alkalmazott szerkesztése: ${employee.name}`)
          : t("Add New Employee", "Nový zamestnanec", "Új alkalmazott")}
        subtitle={t(
          "Configure personal data, contract conditions, salary rate, Toggl time tracking & vacation quotas",
          "Osobné údaje, zmluvné podmienky, mzdová sadzba, prepojenie na Toggl a nároky na dovolenku",
          "Személyes adatok, szerződéses feltételek, bérsáv, Toggl időkövetés és szabadságkeret"
        )}
        actions={
      <div className="flex items-center gap-3 p-2.5 px-4 rounded-2xl bg-slate-50/80 border border-slate-200/80">
        <div>
          <span className="text-ui font-bold text-slate-800 block">
            {isActive
              ? t("Active Employee", "Aktívny zamestnanec", "Aktív alkalmazott")
              : t("Inactive / Archived", "Neaktívny / Archivovaný", "Inaktív / Archivált")}
          </span>
          <span className="text-micro text-slate-400 block">
            {isActive
              ? t("Included in payroll and matrices", "Zahrnutý v mzdovej matici", "Szerepel a bérmátrixban")
              : t("Excluded from active calculations", "Vylúčený z aktívnych výpočtov", "Nem szerepel a számításokban")}
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>
        }
      />

      {/* Validation banner if error */}
      {validationError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 text-ui font-medium flex items-center gap-3 animate-shake">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Two-Column Responsive Form Layout */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 ws-lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Main Profile, Address, Compensation & Notes (7 cols) */}
        <div className="ws-lg:col-span-7 space-y-6">
          {/* Card 1: Personal & Contact Information */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-body font-heading font-bold text-slate-900">
                  {t("Personal & Contact Information", "Osobné a kontaktné údaje", "Személyes és elérhetőségi adatok")}
                </h3>
                <p className="text-caption text-slate-400">
                  {t("Basic identification and communication details", "Základná identifikácia a kontaktné spojenie", "Alapvető azonosító és kapcsolat adatok")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-4 pt-1">
              <div className="ws-sm:col-span-2">
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Full Name & Titles *", "Meno, priezvisko a tituly *", "Teljes név és titulus *")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="e.g. Ing. Michal Kováč, PhD."
                    className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Personal ID / PIN (Rodné číslo)", "Rodné číslo / Identifikátor", "Személyi azonosító")}
                </label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="e.g. 880512/7412"
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                />
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Phone Number", "Telefónne číslo", "Telefonszám")}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+421 905 123 456"
                    className="w-full pl-10 pr-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                  />
                </div>
              </div>

              <div className="ws-sm:col-span-2">
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Email Address", "Emailová adresa", "E-mail cím")}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="michal.kovac@cstudios.sk"
                    className="w-full pl-10 pr-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Permanent Address */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-body font-heading font-bold text-slate-900">
                  {t("Permanent Residence & Address", "Trvalé bydlisko a adresa", "Állandó lakcím")}
                </h3>
                <p className="text-caption text-slate-400">
                  {t("Legal residence for tax documents and contracts", "Adresa trvalého pobytu pre zmluvy a výplatné pásky", "Bejelentett lakcím a szerződésekhez")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-4 pt-1">
              <div className="ws-sm:col-span-3">
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Street & Number", "Ulica a orientačné číslo", "Utca és házszám")}
                </label>
                <input
                  type="text"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  placeholder="e.g. Ružová dolina 25/B"
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                />
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("City / Municipality", "Mesto / Obec", "Város / Település")}
                </label>
                <input
                  type="text"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="Bratislava"
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                />
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("ZIP / Postal Code", "PSČ", "Irányítószám")}
                </label>
                <input
                  type="text"
                  value={addressZip}
                  onChange={(e) => setAddressZip(e.target.value)}
                  placeholder="821 09"
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                />
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Country", "Krajina", "Ország")}
                </label>
                <input
                  type="text"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                  placeholder="Slovakia"
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Compensation & Payroll */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-body font-heading font-bold text-slate-900">
                  {t("Salary & Compensation Terms", "Mzda a mzdové podmienky", "Bér és díjazási feltételek")}
                </h3>
                <p className="text-caption text-slate-400">
                  {t("Base rate, payment schedule and Financial Hub integration", "Základná sadzba, termín výplaty a prepojenie do Financií", "Alapbér, kifizetési határidő és pénzügyi szinkronizáció")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 ws-sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t("Salary Cycle / Type", "Typ mzdy", "Bér típusa")}
                </label>
                <select
                  value={salaryType}
                  onChange={(e) => setSalaryType(e.target.value as any)}
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium"
                >
                  <option value="monthly">{t("Monthly (Mesačná)", "Mesačná mzda", "Havi fix bér")}</option>
                  <option value="daily">{t("Daily (Denná)", "Denná sadzba", "Napidíj")}</option>
                  <option value="hourly">{t("Hourly (Hodinová)", "Hodinová sadzba", "Óradíj")}</option>
                </select>
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t(`Base Rate / Amount (${systemCurrency})`, `Základná sadzba (${systemCurrency})`, `Alapbér összege (${systemCurrency})`)}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={salaryAmount}
                    onChange={(e) => setSalaryAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                  />
                  <span className="absolute right-4 top-2.5 text-body font-bold text-slate-400">
                    {systemCurrency}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-ui font-bold text-slate-600 mb-1.5">
                  {t(
                    `Salary Due Day (Default: ${settings.salaryDueDay ?? 15}.)`,
                    `Výplatný termín (Predvolený: ${settings.salaryDueDay ?? 15}.)`,
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
                  className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
                />
              </div>
            </div>

            {/* Financial sync setting card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-4 mt-2">
              <div>
                <span className="text-ui font-bold text-slate-800 block">
                  {t("Auto-sync to Financial Hub", "Automaticky zaznamenávať výplaty do Financií", "Kifizetések automatikus rögzítése a Pénzügyekben")}
                </span>
                <span className="text-caption text-slate-500 block mt-0.5">
                  {t(
                    "Generates planned expense entries for unpaid periods and marks them paid upon settlement",
                    "Pri nevyplatenej mzde vytvorí plánovaný výdavok, po úhrade ho označí ako uhradený",
                    "Kifizetetlen bérnél tervezett kiadást rögzít, rendezéskor automatikusan teljesítetté válik"
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
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c29b62]"></div>
                </label>

                {autoExpense && (
                  <select
                    value={expenseCategoryId}
                    onChange={(e) => setExpenseCategoryId(e.target.value)}
                    className="px-3 py-1.5 text-ui bg-white border border-slate-200 rounded-xl text-slate-800 shadow-sm"
                  >
                    <option value="">{t("Default Category (Mzdy)", "Predvolená kategória (Mzdy)", "Alapértelmezett kategória")}</option>
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

          {/* Card 4: Internal Notes */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-body font-heading font-bold text-slate-900">
                  {t("Internal Notes & Observations", "Interné poznámky a záznamy", "Belső feljegyzések és megjegyzések")}
                </h3>
                <p className="text-caption text-slate-400">
                  {t("Hardware handed over, probation details, or private HR memos", "Odovzdaný hardvér, skúšobná lehota alebo interné HR poznámky", "Kiadott eszközök, próbaidő vagy egyéb belső feljegyzések")}
                </p>
              </div>
            </div>

            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("e.g. MacBook Pro M3 handed over on 2026-02-01. Probation ends on 2026-05-01.", "napr. Odovzdaný služobný notebook MacBook M3, skúšobná doba do 01.05.2026.", "pl. Céges laptop átadva, próbaidő vége: 2026.05.01.")}
              className="w-full px-4 py-3 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm"
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Vacation Quotas, Toggl Track & Contracts (5 cols) */}
        <div className="ws-lg:col-span-5 space-y-6">
          {/* Card 5: Vacation & Leave Allowances */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-body font-heading font-bold text-slate-900">
                    {t("Vacation Quotas", "Ročný nárok na voľno", "Szabadságkeret")}
                  </h3>
                  <span className="type-overline text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                    {t("Days / Year", "Dni / Rok", "Nap / Év")}
                  </span>
                </div>
                <p className="text-caption text-slate-400">
                  {t("Annual allowance limits per absence category", "Limity voľna pre jednotlivé kategórie absencie", "Éves keret kategóriánként")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {(settings.vacationTypes && settings.vacationTypes.length > 0
                ? settings.vacationTypes
                : [
                    { id: "annual", name: "Dovolenka", defaultAllowance: 25 },
                    { id: "sick", name: "PN / Nemocenská", defaultAllowance: 10 },
                    { id: "doctor", name: "Lekár", defaultAllowance: 7 },
                    { id: "unpaid", name: "Neplatené voľno", defaultAllowance: 0 }
                  ]
              ).map((vt) => (
                <div key={vt.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="block text-ui font-semibold text-slate-700 truncate mb-1.5" title={vt.name}>
                    {vt.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={vacationAllowances[vt.id] !== undefined ? vacationAllowances[vt.id] : (vt.defaultAllowance ?? vt.defaultDays ?? 0)}
                      onChange={(e) =>
                        setVacationAllowances({
                          ...vacationAllowances,
                          [vt.id]: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-full px-3 py-1.5 text-body bg-white border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-[#c29b62] shadow-sm"
                    />
                    <span className="text-ui font-bold text-slate-400">
                      {t("d", "d", "n")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 6: Toggl Track User Mapping */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-body font-heading font-bold text-slate-900">
                  {t("Toggl Track User Mapping", "Prepojenie na Toggl Track", "Toggl fiók összerendelése")}
                </h3>
                <p className="text-caption text-slate-400">
                  {t("Sync live worked hours and projects for this employee", "Zobrazovanie odpracovaných hodín a projektov", "Munkaórák és projektek szinkronizálása")}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              {loadingTogglUsers ? (
                <div className="flex items-center gap-2.5 text-ui text-slate-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#c29b62]" />
                  <span>{t("Loading workspace users from Toggl...", "Načítavam používateľov z Toggl...", "Felhasználók betöltése a Toggl-ből...")}</span>
                </div>
              ) : togglUsers.length > 0 ? (
                <div>
                  <label className="block text-ui font-bold text-slate-600 mb-1.5">
                    {t("Select Toggl Workspace User", "Vyberte používateľa z Toggl", "Válasszon Toggl felhasználót")}
                  </label>
                  <select
                    value={timeTrackingUserId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setTimeTrackingUserId(selectedId);
                      const found = togglUsers.find((u) => String(u.id) === selectedId);
                      setTimeTrackingUserName(found ? found.name || found.email : "");
                    }}
                    className="w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm font-medium"
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
                <div className="space-y-2">
                  <div className="text-ui text-slate-500">
                    {hasTogglKey
                      ? t(
                          "Manual user mapping (or workspace users not loaded):",
                          "Manuálne zadanie Toggl User ID:",
                          "Kézi Toggl User ID megadása:"
                        )
                      : t(
                          "Toggl API token not configured in Settings. You can enter User ID manually:",
                          "Toggl API token nie je nastavený. Môžete zadať User ID ručne:",
                          "A Toggl token nincs beállítva. Megadhatja az azonosítót kézzel:"
                        )}
                  </div>
                  <input
                    type="text"
                    value={timeTrackingUserId}
                    onChange={(e) => setTimeTrackingUserId(e.target.value)}
                    placeholder={t("Toggl User ID (e.g. 10245089)", "Toggl User ID (napr. 10245089)", "Toggl User ID")}
                    className="w-full px-3 py-2 text-ui bg-white border border-slate-200 rounded-xl text-slate-900 font-mono shadow-sm"
                  />
                </div>
              )}

              {togglFetchError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 text-ui flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{togglFetchError}</span>
                </div>
              )}

              {timeTrackingUserId && (
                <div className="flex items-center gap-2 p-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-ui text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>
                    {t(
                      `Linked to Toggl User: ${timeTrackingUserName || timeTrackingUserId}`,
                      `Prepojené s Toggl: ${timeTrackingUserName || timeTrackingUserId}`,
                      `Összerendelve Toggl-lel: ${timeTrackingUserName || timeTrackingUserId}`
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 7: Contracts & Uploaded Documents */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-body font-heading font-bold text-slate-900">
                    {t("Contracts & Documents", "Zmluvy a dokumenty", "Szerződések és iratok")}
                  </h3>
                  <p className="text-caption text-slate-400">
                    {t("Employment contracts, NDAs, certificates", "Pracovné zmluvy, NDA, certifikáty", "Munkaszerződések, titoktartási nyilatkozatok")}
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-1.5 px-3 py-1.5 text-ui font-heading font-bold rounded-xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white hover:shadow-md cursor-pointer shadow-sm transition">
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>
                  {isUploading
                    ? t("Uploading...", "Nahrávam...", "Feltöltés...")
                    : t("Upload File", "Nahrať súbor", "Fájl feltöltése")}
                </span>
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
              <div className="p-3 rounded-2xl bg-red-500/10 text-red-600 text-ui flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {files.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl text-ui text-slate-400">
                <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <span>
                  {t(
                    "No contract files attached yet. Click above to upload PDF or DOC documents.",
                    "Zatiaľ nie sú pripojené žiadne zmluvy. Kliknite hore pre nahratie PDF alebo DOC.",
                    "Még nincsenek csatolt dokumentumok. Kattintson a feltöltéshez."
                  )}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/60 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 text-[#9e7638] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-ui font-bold text-slate-900 truncate">{file.name}</p>
                        <p className="text-micro text-slate-400">
                          {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""} •{" "}
                          {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white transition"
                        title={t("Download / View", "Stiahnuť / Zobraziť", "Letöltés / Megtekintés")}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
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
        </div>

        {/* BOTTOM FIXED / STICKY ACTION BAR */}
        <div className="ws-lg:col-span-12">
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-4 px-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-ui font-heading font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-caption text-slate-400 hidden ws-sm:inline">
                {t("Press Ctrl+Enter to save", "Uložte stlačením Ctrl+Enter", "Mentés: Ctrl+Enter")}
              </span>
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={isSavedRecently}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white font-heading font-bold text-ui shadow-lg shadow-[#c29b62]/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
              >
                {isSavedRecently ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t("Saved!", "Uložené!", "Mentve!")}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>
                      {isEditing
                        ? t("Save Changes", "Uložiť zmeny", "Módosítások mentése")
                        : t("Create Employee Profile", "Vytvoriť profil zamestnanca", "Alkalmazotti profil létrehozása")}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EmployeeFormScreen;
