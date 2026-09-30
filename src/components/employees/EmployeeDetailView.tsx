import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Coins,
  Clock,
  Calendar,
  FileText,
  Upload,
  Download,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  FileCheck
} from "lucide-react";
import type {
  Employee,
  EmployeeFile,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation,
  FinancialCategory
} from "../../types";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { VacationRequestModal } from "./VacationRequestModal";

interface EmployeeDetailViewProps {
  employee: Employee;
  employees: Employee[];
  salaries: EmployeeSalary[];
  vacations: EmployeeVacation[];
  settings: EmployeeSettings;
  financialCategories: FinancialCategory[];
  onBack: () => void;
  onUpdateEmployee: (updated: Employee) => void;
  onEditEmployee?: (employee: Employee) => void;
  onSaveSalary: (salary: EmployeeSalary) => void;
  onSaveVacation: (vacation: EmployeeVacation) => void;
  onDeleteVacation: (vacationId: string) => void;
  systemLanguage?: string;
  systemCurrency?: string;
}

export const EmployeeDetailView: React.FC<EmployeeDetailViewProps> = ({
  employee,
  employees,
  salaries,
  vacations,
  settings,
  financialCategories,
  onBack,
  onUpdateEmployee,
  onEditEmployee,
  onSaveSalary: _onSaveSalary,
  onSaveVacation,
  onDeleteVacation,
  systemLanguage = "sk",
  systemCurrency = "€"
}) => {
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

  const [activeTab, setActiveTab] = useState<"hours" | "salaries" | "vacations" | "files">(() => {
    return hasTogglKey ? "hours" : "salaries";
  });

  // If Toggl key is not set up, don't stay on hours tab
  useEffect(() => {
    if (!hasTogglKey && activeTab === "hours") {
      setActiveTab("salaries");
    }
  }, [hasTogglKey, activeTab]);

  // Edit employee modal
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Vacation modal
  const [isVacationModalOpen, setIsVacationModalOpen] = useState<boolean>(false);
  const [vacationToEdit, setVacationToEdit] = useState<EmployeeVacation | null>(null);

  // Time tracking (Toggl) month/year selector
  const currentDate = new Date();
  const [togglYear, setTogglYear] = useState<number>(currentDate.getFullYear());
  const [togglMonth, setTogglMonth] = useState<number>(currentDate.getMonth() + 1);

  // Toggl hours data state
  const [loadingHours, setLoadingHours] = useState<boolean>(false);
  const [hoursData, setHoursData] = useState<{
    totalHours: number;
    weekly: Record<string, { weekNum: number; hours: number; startDate: string; endDate: string }>;
    daily: Record<string, number>;
    projects: Record<string, number>;
  } | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  // Calendar month state for vacation tab
  const [calYear, setCalYear] = useState<number>(currentDate.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(currentDate.getMonth() + 1);

  // File upload state
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  const monthNames = useMemo(() => {
    return [
      t("January", "Január", "Január"),
      t("February", "Február", "Február"),
      t("March", "Marec", "Március"),
      t("April", "Apríl", "Április"),
      t("May", "Máj", "Május"),
      t("June", "Jún", "Június"),
      t("July", "Júl", "Július"),
      t("August", "August", "Augusztus"),
      t("September", "September", "Szeptember"),
      t("October", "Október", "Október"),
      t("November", "November", "November"),
      t("December", "December", "December")
    ];
  }, [systemLanguage]);

  // Vacation types config
  const vacationTypes = useMemo(() => {
    return settings.vacationTypes && settings.vacationTypes.length > 0
      ? settings.vacationTypes
      : [
          { id: "annual", name: "Dovolenka", defaultAllowance: 25, color: "#c29b62" },
          { id: "sick", name: "PN", defaultAllowance: 10, color: "#ef4444" },
          { id: "doctor", name: "Lekár", defaultAllowance: 7, color: "#3b82f6" },
          { id: "unpaid", name: "Neplatené", defaultAllowance: 0, color: "#8b5cf6" }
        ];
  }, [settings.vacationTypes]);

  // Fetch Toggl hours when month/year changes or tab is hours
  useEffect(() => {
    if (!hasTogglKey || activeTab !== "hours") return;
    if (!employee.timeTrackingUserId && !settings.togglApiKey) {
      setHoursData(null);
      return;
    }

    let isMounted = true;
    setLoadingHours(true);
    setHoursError(null);

    const empIdParam = encodeURIComponent(employee.id);
    fetch(`/api/time_tracking.php?action=fetch_employee_hours&employee_id=${empIdParam}&year=${togglYear}&month=${togglMonth}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.data) {
          setHoursData(data.data);
        } else {
          setHoursError(data.error || data.message || "No data");
          setHoursData(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setHoursError(err.message || "Failed to load hours");
          setHoursData(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingHours(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasTogglKey, activeTab, employee.id, employee.timeTrackingUserId, togglYear, togglMonth, settings.togglApiKey]);

  // Employee Salaries history sorted by year/month DESC
  const employeeSalaries = useMemo(() => {
    return salaries
      .filter((s) => s.employeeId === employee.id)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return (b.periodNumber || 0) - (a.periodNumber || 0);
      });
  }, [salaries, employee.id]);

  // Employee Vacations history
  const employeeVacations = useMemo(() => {
    return vacations
      .filter((v) => v.employeeId === employee.id)
      .sort((a, b) => (b.startDate > a.startDate ? 1 : -1));
  }, [vacations, employee.id]);

  // Vacation KPI calculations for this year
  const vacationStats = useMemo(() => {
    const stats: Record<string, { used: number; allowance: number; name: string; color: string }> = {};

    vacationTypes.forEach((vt) => {
      const allowance =
        employee.vacationAllowances?.[vt.id] !== undefined
          ? employee.vacationAllowances[vt.id]
          : (vt.defaultAllowance ?? vt.defaultDays ?? 25);
      stats[vt.id] = {
        used: 0,
        allowance,
        name: vt.name,
        color: vt.color || "#c29b62"
      };
    });

    employeeVacations.forEach((vac) => {
      if (vac.status === "rejected") return;
      const vYear = parseInt(vac.startDate.split("-")[0]);
      if (vYear === calYear) {
        const typeId = vac.vacationTypeId || "annual";
        if (stats[typeId]) {
          stats[typeId].used += Number(vac.daysCount) || 1;
        }
      }
    });

    return stats;
  }, [vacationTypes, employee.vacationAllowances, employeeVacations, calYear]);

  // Calendar dates matrix for vacation calendar tab
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const lastDay = new Date(calYear, calMonth, 0);
    const totalDays = lastDay.getDate();

    // Monday as day 0 in Central Europe (JS getDay() has Sun=0, Mon=1)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      vacation?: EmployeeVacation;
      vacType?: (typeof vacationTypes)[0];
    }> = [];

    // Empty lead cells
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ dateStr: "", dayNum: 0, isCurrentMonth: false });
    }

    // Days of current month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      // Check if employee has vacation on this day
      const vac = employeeVacations.find((v) => {
        if (v.status === "rejected") return false;
        return dateStr >= v.startDate && dateStr <= v.endDate;
      });
      const vType = vac ? vacationTypes.find((vt) => vt.id === vac.vacationTypeId) : undefined;

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        vacation: vac,
        vacType: vType
      });
    }

    return days;
  }, [calYear, calMonth, employeeVacations, vacationTypes]);

  // Handle file upload for contracts and documents
  const uploadSingleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("module", "employees");
      formData.append("eventId", `emp_contract_${Date.now()}`);

      const res = await fetch("/upload.php", {
        method: "POST",
        body: formData
      });

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
        const updated = {
          ...employee,
          files: [...(employee.files || []), newFile]
        };
        onUpdateEmployee(updated);
      }
    } catch (err) {
      console.error("Contract upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadContract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await uploadSingleFile(fileList[0]);
    e.target.value = "";
  };

  const handleDropFile = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadSingleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveContract = (fileId: string) => {
    const updated = {
      ...employee,
      files: (employee.files || []).filter((f) => f.id !== fileId)
    };
    onUpdateEmployee(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-2xl glass-panel border border-white/60 bg-white/90 text-slate-700 hover:bg-white hover:text-slate-900 transition shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>{t("Back to Employees", "Späť na zoznam", "Vissza az alkalmazottakhoz")}</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                employee.isActive !== false
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              {employee.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
            </span>
            <span className="text-xs text-slate-400">• ID: {employee.id}</span>
          </div>
        </div>

        <button
          onClick={() => (onEditEmployee ? onEditEmployee(employee) : setIsEditModalOpen(true))}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-2xl bg-[#c29b62] text-white hover:bg-[#b08b53] transition shadow-md shadow-[#c29b62]/20 cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>{t("Edit Profile", "Upraviť profil", "Profil szerkesztése")}</span>
        </button>
      </div>

      {/* Main Split Layout: Left Profile & Documents, Right 3 Sub-Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Profile Info & Contracts (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Profile Card */}
          <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#c29b62]/15 border border-[#c29b62]/30 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center font-bold text-xl shrink-0 shadow-sm">
                {employee.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-900 truncate">
                  {employee.name}
                </h2>
                {employee.pin && (
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {t("PIN / RČ:", "Rodné číslo:", "Személyi szám:")} {employee.pin}
                  </p>
                )}
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#c29b62]/10 border border-[#c29b62]/20 text-[#9e7638] dark:text-[#d4af7a] text-xs font-semibold">
                  <Coins className="w-3.5 h-3.5 text-[#c29b62]" />
                  <span>
                    {(employee.salaryAmount || 0).toLocaleString()} {systemCurrency} /{" "}
                    {employee.salaryType === "hourly"
                      ? t("hour", "hodina", "óra")
                      : employee.salaryType === "daily"
                      ? t("day", "deň", "nap")
                      : t("month", "mesiac", "hónap")}
                  </span>
                </div>
              </div>
            </div>

            {/* Contact Details List */}
            <div className="pt-4 border-t border-slate-100 space-y-3 text-xs">
              {employee.email && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <a href={`mailto:${employee.email}`} className="hover:text-[#c29b62] truncate">
                    {employee.email}
                  </a>
                </div>
              )}

              {employee.phone && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <a href={`tel:${employee.phone}`} className="hover:text-[#c29b62]">
                    {employee.phone}
                  </a>
                </div>
              )}

              {(employee.addressStreet || employee.addressCity) && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    {employee.addressStreet}
                    {employee.addressCity ? `, ${employee.addressCity}` : ""}
                    {employee.addressZip ? ` ${employee.addressZip}` : ""}
                    {employee.addressCountry ? ` (${employee.addressCountry})` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Compensation & Schedule Details */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t("Salary Due Day", "Výplatný deň", "Kifizetési nap")}:</span>
                <span className="font-semibold text-slate-800">
                  {employee.salaryDueDay
                    ? `${employee.salaryDueDay}. ${t("of month", "v mesiaci", "a hónapban")}`
                    : `${settings.salaryDueDay ?? 15}. ${t("(default)", "(predvolený)", "(alapértelmezett)")}`}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t("Time Tracking", "Meranie času", "Időkövetés")}:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#c29b62]" />
                  {employee.timeTrackingUserName ||
                    (employee.timeTrackingUserId ? `ID: ${employee.timeTrackingUserId}` : t("Not mapped", "Neprepojené", "Nincs összerendelve"))}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t("Auto-Expense Sync", "Auto výdavok do financií", "Auto kiadás szinkron")}:</span>
                <span
                  className={`font-semibold ${
                    employee.autoExpense ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {employee.autoExpense ? t("Active", "Aktívny", "Aktív") : t("Disabled", "Vypnuté", "Kikapcsolva")}
                </span>
              </div>
            </div>

            {employee.notes && (
              <div className="pt-4 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  {t("Notes", "Poznámky", "Jegyzetek")}
                </span>
                <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                  {employee.notes}
                </p>
              </div>
            )}

            {/* Quick Link to Contracts & Documents */}
            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab("files")}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer ${
                  activeTab === "files"
                    ? "bg-[#c29b62]/15 border-[#c29b62]/40 text-[#9e7638] dark:text-[#d4af7a]"
                    : "bg-slate-50/80 hover:bg-slate-100 border-slate-200/80 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2.5 text-xs font-bold">
                  <FileCheck className="w-4 h-4 text-[#c29b62]" />
                  <span>{t("Contracts & Files", "Pracovné zmluvy a súbory", "Szerződések és fájlok")}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200/80 text-slate-600 text-[11px]">
                    {employee.files?.length || 0}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 3 SUB-TABS (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Sub-Tabs Navigation */}
          <div className="flex items-center gap-2 p-1.5 glass-panel rounded-2xl border border-white/60 bg-white/80 shadow-sm">
            {hasTogglKey && (
              <button
                onClick={() => setActiveTab("hours")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow-sm ${
                  activeTab === "hours"
                    ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{t("Worked Hours (Toggl)", "Odpracované hodiny (Toggl)", "Ledolgozott órák (Toggl)")}</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab("salaries")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === "salaries"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>{t("Salaries & Payments", "História miezd a výplat", "Bérek és kifizetések")}</span>
            </button>

            <button
              onClick={() => setActiveTab("vacations")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === "vacations"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>{t("Vacation & Absences", "Dovolenka a absencie", "Szabadság és távollét")}</span>
            </button>

            <button
              onClick={() => setActiveTab("files")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === "files"
                  ? "bg-[#c29b62] text-white shadow-md shadow-[#c29b62]/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>{t("Contracts & Files", "Zmluvy a dokumenty", "Szerződések és iratok")}</span>
              {employee.files && employee.files.length > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === "files"
                      ? "bg-white/30 text-white"
                      : "bg-slate-200/80 text-slate-700"
                  }`}
                >
                  {employee.files.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: WORKED HOURS (TOGGL) */}
          {hasTogglKey && activeTab === "hours" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Month / Year Filter Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => {
                        if (togglMonth === 1) {
                          setTogglMonth(12);
                          setTogglYear((y) => y - 1);
                        } else {
                          setTogglMonth((m) => m - 1);
                        }
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-900 transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 text-xs font-bold text-slate-800">
                      {monthNames[togglMonth - 1]} {togglYear}
                    </span>
                    <button
                      onClick={() => {
                        if (togglMonth === 12) {
                          setTogglMonth(1);
                          setTogglYear((y) => y + 1);
                        } else {
                          setTogglMonth((m) => m + 1);
                        }
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-900 transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Status indicator */}
                <div className="flex items-center gap-2 text-xs">
                  {loadingHours ? (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c29b62]" />
                      <span>{t("Fetching from Toggl...", "Sťahujem z Toggl...", "Letöltés a Toggl-ből...")}</span>
                    </div>
                  ) : employee.timeTrackingUserId ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {t("Connected", "Prepojené s Toggl", "Kapcsolódva")}: {employee.timeTrackingUserName || employee.timeTrackingUserId}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-amber-600 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{t("No Toggl user mapped", "Chýba priradený Toggl používateľ", "Nincs hozzárendelt Toggl fiók")}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* If no user mapped or error */}
              {!employee.timeTrackingUserId ? (
                <div className="p-8 text-center glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-3">
                  <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">
                    {t("Toggl Time Tracking Not Linked", "Toggl meranie času nie je prepojené", "A Toggl időkövetés nincs összerendelve")}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {t(
                      "To automatically view worked hours for this employee, edit their profile and link their Toggl Track account from the dropdown.",
                      "Pre zobrazenie odpracovaných hodín prepojte tohto zamestnanca s jeho účtom v Toggl Track.",
                      "Az órák megtekintéséhez rendelje hozzá az alkalmazottat a Toggl Track fiókjához."
                    )}
                  </p>
                  <button
                    onClick={() => (onEditEmployee ? onEditEmployee(employee) : setIsEditModalOpen(true))}
                    className="px-4 py-2 text-xs font-semibold rounded-2xl bg-[#c29b62] text-white hover:bg-[#b08b53] transition shadow-md shadow-[#c29b62]/20 cursor-pointer"
                  >
                    {t("Link Toggl User", "Prepojiť používateľa", "Toggl felhasználó összerendelése")}
                  </button>
                </div>
              ) : hoursError ? (
                <div className="p-6 bg-red-500/10 rounded-2xl border border-red-500/20 text-xs text-red-600 space-y-1">
                  <p className="font-semibold">{t("Failed to load Toggl hours", "Nepodarilo sa načítať hodiny z Toggl", "Nem sikerült betölteni az órákat")}</p>
                  <p>{hoursError}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Hours KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                          {t("Total Worked Hours", "Celkovo odpracované", "Összes ledolgozott óra")}
                        </span>
                        <span className="text-2xl font-bold font-mono text-slate-900 mt-1 block">
                          {(hoursData?.totalHours || 0).toFixed(1)} h
                        </span>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-[#c29b62]/10 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center">
                        <Clock className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="p-5 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                          {employee.salaryType === "hourly"
                            ? t("Calculated Compensation", "Vypočítaná odmena", "Számított juttatás")
                            : t("Expected Monthly Base", "Základná mesačná sadzba", "Alapbér")}
                        </span>
                        <span className="text-2xl font-bold font-mono text-[#9e7638] dark:text-[#d4af7a] mt-1 block">
                          {employee.salaryType === "hourly"
                            ? `${((hoursData?.totalHours || 0) * (employee.salaryAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${systemCurrency}`
                            : `${(employee.salaryAmount || 0).toLocaleString()} ${systemCurrency}`}
                        </span>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                        <Coins className="w-6 h-6" />
                      </div>
                    </div>
                  </div>

                  {/* Weekly Breakdown Cards */}
                  <div className="p-6 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#b58b4c] dark:text-[#d4af7a]">
                      {t("Weekly Hours Breakdown", "Týždenný rozpis odpracovaných hodín", "Heti órabontás")}
                    </h4>

                    {hoursData?.weekly && Object.keys(hoursData.weekly).length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {Object.entries(hoursData.weekly).map(([wKey, wVal]) => (
                          <div
                            key={wKey}
                            className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-center"
                          >
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">
                              {t("Week", "Týždeň", "Hét")} {wVal.weekNum}
                            </span>
                            <span className="text-base font-bold font-mono text-slate-900 my-1 block">
                              {wVal.hours.toFixed(1)} h
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {wVal.startDate.split("-").slice(1).join("/")} - {wVal.endDate.split("-").slice(1).join("/")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-4">
                        {t("No hours recorded for this period in Toggl.", "Žiadne záznamy v Toggl pre tento mesiac.", "Nincs rögzített óra a Toggl-ben.")}
                      </p>
                    )}
                  </div>

                  {/* Project Distribution */}
                  {hoursData?.projects && Object.keys(hoursData.projects).length > 0 && (
                    <div className="p-6 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#b58b4c] dark:text-[#d4af7a]">
                        {t("Projects Breakdown", "Rozdelenie hodín podľa projektov", "Projektek szerinti megoszlás")}
                      </h4>

                      <div className="space-y-2">
                        {Object.entries(hoursData.projects).map(([projName, pHours]) => {
                          const pct = hoursData.totalHours > 0 ? (pHours / hoursData.totalHours) * 100 : 0;
                          return (
                            <div key={projName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-800">{projName}</span>
                                <span className="font-mono text-slate-500">
                                  {pHours.toFixed(1)} h ({pct.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full bg-[#c29b62] rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SALARIES & PAYMENTS HISTORY */}
          {activeTab === "salaries" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-6 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {t("Payroll & Compensation Records", "Evidencia výplat zamestnanca", "Bér- és kifizetési nyilvántartás")}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {t(
                        "History of monthly payouts, due dates, and financial sync status",
                        "História mesačných miezd, termíny splatnosti a stav úhrad",
                        "Havi bérek története, esedékesség és kifizetési állapotok"
                      )}
                    </p>
                  </div>
                </div>

                {employeeSalaries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-slate-200/80 rounded-2xl bg-slate-50/50">
                    {t(
                      "No salary records created for this employee yet. Use the Salaries Matrix to view and generate monthly periods.",
                      "Pre tohto zamestnanca zatiaľ neboli zaevidované žiadne mzdy. Otvorte Matica miezd pre zadanie.",
                      "Még nincsenek rögzített bérek ehhez az alkalmazotthoz. Használja a Bérmátrixot."
                    )}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-2.5 px-3">{t("Period", "Obdobie", "Időszak")}</th>
                          <th className="py-2.5 px-3">{t("Due Date", "Splatnosť", "Esedékesség")}</th>
                          <th className="py-2.5 px-3 text-right">{t("Salary", "Mzda", "Bér")}</th>
                          <th className="py-2.5 px-3 text-right">{t("Paid", "Vyplatené", "Kifizetve")}</th>
                          <th className="py-2.5 px-3 text-center">{t("Status", "Stav", "Állapot")}</th>
                          <th className="py-2.5 px-3">{t("Payment Date", "Dátum úhrady", "Fizetés dátuma")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {employeeSalaries.map((sal) => {
                          const isFullyPaid = sal.totalPaid >= sal.totalSalary && sal.totalSalary > 0;
                          const isPartial = sal.totalPaid > 0 && !isFullyPaid;

                          return (
                            <tr key={sal.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {sal.periodKey} ({monthNames[(sal.periodNumber || 1) - 1]} {sal.year})
                              </td>
                              <td className="py-2.5 px-3 text-slate-500">
                                {sal.dueDate ? new Date(sal.dueDate).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                                {sal.totalSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })} {systemCurrency}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600">
                                {sal.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} {systemCurrency}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isFullyPaid
                                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                      : isPartial
                                      ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                                      : "bg-slate-100 text-slate-600 border border-slate-200"
                                  }`}
                                >
                                  {isFullyPaid
                                    ? t("Paid", "Vyplatené", "Kifizetve")
                                    : isPartial
                                    ? t("Partially Paid", "Čiastočne", "Részben")
                                    : t("Planned", "Plánované", "Tervezett")}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-500">
                                {sal.paymentDate ? new Date(sal.paymentDate).toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: VACATIONS & ABSENCES */}
          {activeTab === "vacations" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Top: Leave Allowance KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(vacationStats).map(([vtId, stat]) => {
                  const remaining = Math.max(0, stat.allowance - stat.used);
                  const pct = stat.allowance > 0 ? Math.min(100, (stat.used / stat.allowance) * 100) : 0;

                  return (
                    <div
                      key={vtId}
                      className="p-4 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {stat.name}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: stat.color }}
                        />
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-bold font-mono text-slate-900">
                          {stat.used} <span className="text-xs font-normal text-slate-400">/ {stat.allowance} d</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {remaining} {t("left", "zostáva", "maradt")}
                        </span>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: stat.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Interactive Calendar Card */}
              <div className="p-6 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => {
                          if (calMonth === 1) {
                            setCalMonth(12);
                            setCalYear((y) => y - 1);
                          } else {
                            setCalMonth((m) => m - 1);
                          }
                        }}
                        className="p-1 rounded-lg text-slate-500 hover:text-slate-900 transition"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-xs font-bold text-slate-800">
                        {monthNames[calMonth - 1]} {calYear}
                      </span>
                      <button
                        onClick={() => {
                          if (calMonth === 12) {
                            setCalMonth(1);
                            setCalYear((y) => y + 1);
                          } else {
                            setCalMonth((m) => m + 1);
                          }
                        }}
                        className="p-1 rounded-lg text-slate-500 hover:text-slate-900 transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setVacationToEdit(null);
                      setIsVacationModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-2xl bg-[#c29b62] text-white hover:bg-[#b08b53] transition shadow-md shadow-[#c29b62]/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t("Record Vacation", "Zadať voľno", "Szabadság rögzítése")}</span>
                  </button>
                </div>

                {/* Calendar Day-of-week header */}
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 py-1 border-b border-slate-100">
                  <span>{t("Mon", "Po", "H")}</span>
                  <span>{t("Tue", "Ut", "K")}</span>
                  <span>{t("Wed", "St", "Sze")}</span>
                  <span>{t("Thu", "Št", "Cs")}</span>
                  <span>{t("Fri", "Pi", "P")}</span>
                  <span className="text-amber-500/80">{t("Sat", "So", "Szo")}</span>
                  <span className="text-red-500/80">{t("Sun", "Ne", "V")}</span>
                </div>

                {/* Calendar grid cells */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarGrid.map((cell, idx) => {
                    if (!cell.isCurrentMonth) {
                      return <div key={idx} className="h-14 rounded-2xl bg-slate-100/40 border border-dashed border-slate-200/50" />;
                    }

                    const hasVac = !!cell.vacation;
                    const vacColor = cell.vacType?.color || "#c29b62";

                    return (
                      <div
                        key={idx}
                        className={`h-14 p-1.5 rounded-2xl border text-xs flex flex-col justify-between transition ${
                          hasVac
                            ? "border-transparent text-white font-bold shadow-sm"
                            : "bg-slate-50/70 border-slate-200/70 text-slate-700 hover:bg-slate-100/80"
                        }`}
                        style={hasVac ? { backgroundColor: vacColor } : {}}
                      >
                        <span className={`text-[11px] ${hasVac ? "text-white" : "font-semibold"}`}>
                          {cell.dayNum}
                        </span>
                        {hasVac && (
                          <span className="text-[9px] truncate text-white/95">
                            {cell.vacType?.name || "Leave"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vacation Records List */}
              <div className="p-6 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#b58b4c] dark:text-[#d4af7a]">
                  {t("Vacation Request & Approval History", "História žiadostí a čerpania", "Kérelmek és történet")}
                </h4>

                {employeeVacations.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    {t("No vacation records found.", "Žiadne záznamy o dovolenke.", "Nincsenek szabadságrekordok.")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {employeeVacations.map((vac) => {
                      const vType = vacationTypes.find((vt) => vt.id === vac.vacationTypeId);
                      return (
                        <div
                          key={vac.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: vType?.color || "#c29b62" }}
                            />
                            <div>
                              <span className="font-semibold text-slate-900">
                                {vType?.name || "Leave"}: {vac.startDate} → {vac.endDate}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span>{vac.daysCount} {t("days", "dní", "nap")}</span>
                                {vac.note && <span>• {vac.note}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                vac.status === "approved"
                                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                  : vac.status === "pending"
                                  ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                                  : "bg-red-500/10 text-red-600 border border-red-500/20"
                              }`}
                            >
                              {vac.status === "approved"
                                ? t("Approved", "Schválené", "Jóváhagyva")
                                : vac.status === "pending"
                                ? t("Pending", "Čaká", "Függőben")
                                : t("Rejected", "Zamietnuté", "Elutasítva")}
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                setVacationToEdit(vac);
                                setIsVacationModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onDeleteVacation(vac.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* TAB 4: CONTRACTS & DOCUMENTS (FILES) */}
          {activeTab === "files" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Header card with upload CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#c29b62]/15 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center shrink-0 shadow-sm border border-[#c29b62]/25">
                    <FileCheck className="w-5 h-5 text-[#c29b62]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {t("Contracts & Employee Documents", "Pracovné zmluvy a dokumenty zamestnanca", "Szerződések és iratok")}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {employee.files && employee.files.length > 0
                        ? `${employee.files.length} ${t("file(s) attached", "súborov pripojených", "csatolt fájl")} • ${(
                            employee.files.reduce((acc, f) => acc + (f.size || 0), 0) /
                            (1024 * 1024)
                          ).toFixed(2)} MB`
                        : t("No documents uploaded yet", "Zatiaľ žiadne nahraté dokumenty", "Még nincsenek feltöltött dokumentumok")}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-2xl bg-[#c29b62] hover:bg-[#b58b4c] text-white cursor-pointer transition shadow-md shadow-[#c29b62]/20">
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>
                    {isUploading
                      ? t("Uploading...", "Nahrávam...", "Feltöltés...")
                      : t("Upload Document", "Nahrať dokument", "Dokumentum feltöltése")}
                  </span>
                  <input
                    type="file"
                    onChange={handleUploadContract}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Document List / Empty state */}
              {!employee.files || employee.files.length === 0 ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropFile}
                  className="p-12 text-center glass-panel rounded-3xl border-2 border-dashed border-slate-200/90 bg-white/70 hover:bg-white/95 transition space-y-4"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#c29b62]/10 border border-[#c29b62]/20 text-[#c29b62] flex items-center justify-center mx-auto shadow-sm">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">
                      {t("No contracts or documents attached", "Žiadne zmluvy ani dokumenty", "Nincsenek csatolt szerződések")}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {t(
                        "Upload employment agreements, NDAs, identification scans, certifications, or tax declarations. Drag and drop files here or click below to browse.",
                        "Nahrajte pracovnú zmluvu, dohodu, NDA, certifikáty alebo daňové vyhlásenia. Presuňte súbor sem alebo kliknite na tlačidlo.",
                        "Töltsön fel munkaszerződést, titoktartási nyilatkozatot, adóigazolást vagy tanúsítványokat."
                      )}
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-2xl bg-[#c29b62] hover:bg-[#b58b4c] text-white cursor-pointer transition shadow-md shadow-[#c29b62]/25">
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{t("Select File to Upload", "Vybrať súbor z počítača", "Fájl kiválasztása")}</span>
                    <input
                      type="file"
                      onChange={handleUploadContract}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {employee.files.map((file) => {
                      const ext = (file.name.split(".").pop() || "").toLowerCase();
                      const isPdf = ext === "pdf";
                      const isImg = ["png", "jpg", "jpeg", "webp"].includes(ext);

                      return (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-4 glass-panel rounded-2xl border border-white/60 bg-white/95 shadow-sm hover:shadow-md transition group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs uppercase shadow-sm ${
                                isPdf
                                  ? "bg-red-500/15 text-red-600 border border-red-500/20"
                                  : isImg
                                  ? "bg-purple-500/15 text-purple-600 border border-purple-500/20"
                                  : "bg-[#c29b62]/15 text-[#9e7638] dark:text-[#d4af7a] border border-[#c29b62]/20"
                              }`}
                            >
                              {isPdf ? "PDF" : isImg ? "IMG" : <FileText className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""}
                                {file.uploadedAt ? ` • ${new Date(file.uploadedAt).toLocaleDateString()}` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-3">
                            <a
                              href={file.url || file.filePath || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                              title={t("Download / View", "Stiahnuť / Zobraziť", "Letöltés")}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveContract(file.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                              title={t("Delete Document", "Zmazať dokument", "Törlés")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dropzone bar for quick subsequent uploads */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropFile}
                    className="p-4 border-2 border-dashed border-slate-200/80 rounded-2xl text-center bg-slate-50/50 hover:bg-slate-50 transition"
                  >
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#c29b62] cursor-pointer transition">
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#c29b62]" />
                      ) : (
                        <Upload className="w-4 h-4 text-[#c29b62]" />
                      )}
                      <span>
                        {t(
                          "Drop files here or click to upload additional documents",
                          "Presuňte súbory sem alebo kliknite pre nahratie ďalších",
                          "Húzza ide a fájlokat további dokumentumok feltöltéséhez"
                        )}
                      </span>
                      <input
                        type="file"
                        onChange={handleUploadContract}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Employee Profile Modal */}
      {isEditModalOpen && (
        <EmployeeFormModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          employee={employee}
          onSave={(updated) => {
            onUpdateEmployee(updated);
            setIsEditModalOpen(false);
          }}
          settings={settings}
          financialCategories={financialCategories}
          systemLanguage={systemLanguage}
          systemCurrency={systemCurrency}
        />
      )}

      {/* Vacation Request Modal */}
      {isVacationModalOpen && (
        <VacationRequestModal
          isOpen={isVacationModalOpen}
          onClose={() => {
            setIsVacationModalOpen(false);
            setVacationToEdit(null);
          }}
          employees={employees}
          selectedEmployeeId={employee.id}
          vacationToEdit={vacationToEdit}
          settings={settings}
          onSave={(savedVac) => {
            onSaveVacation(savedVac);
            setIsVacationModalOpen(false);
            setVacationToEdit(null);
          }}
          systemLanguage={systemLanguage}
        />
      )}
    </div>
  );
};

export default EmployeeDetailView;
