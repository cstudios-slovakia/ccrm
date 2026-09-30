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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  FileCheck,
  Eye,
  EyeOff,
  User,
  X,
  Save
} from "lucide-react";
import type {
  Employee,
  EmployeeFile,
  EmployeeSalary,
  EmployeeSettings,
  EmployeeVacation,
  FinancialCategory
} from "../../types";
import { VacationRequestModal } from "./VacationRequestModal";
import { SalaryCellDrawer } from "./SalaryCellDrawer";
import { EmployeeTimesheetSummary, type TimesheetHoursData } from "./EmployeeTimesheetSummary";

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
  initialEditMode?: boolean;
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
  onEditEmployee: _onEditEmployee,
  initialEditMode = false,
  onSaveSalary,
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

  const getInitialTab = (): "hours" | "salaries" | "vacations" | "files" => {
    const raw = typeof window !== "undefined" ? window.location.hash : "";
    const params = new URLSearchParams(raw.split("?")[1] || "");
    const tabParam = params.get("tab");
    if (tabParam === "salaries" || tabParam === "vacations" || tabParam === "files") {
      return tabParam;
    }
    if (tabParam === "hours" && hasTogglKey) {
      return "hours";
    }
    return hasTogglKey ? "hours" : "salaries";
  };

  const [activeTab, setActiveTab] = useState<"hours" | "salaries" | "vacations" | "files">(getInitialTab);

  const handleTabClick = (newTab: "hours" | "salaries" | "vacations" | "files") => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const raw = window.location.hash;
      const [path, query] = raw.split("?");
      const params = new URLSearchParams(query || "");
      params.set("tab", newTab);
      window.location.hash = `${path}?${params.toString()}`;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const raw = window.location.hash;
      const params = new URLSearchParams(raw.split("?")[1] || "");
      const tabParam = params.get("tab");
      if (tabParam === "salaries" || tabParam === "vacations" || tabParam === "files") {
        setActiveTab(tabParam);
      } else if (tabParam === "hours" && hasTogglKey) {
        setActiveTab("hours");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [hasTogglKey]);

  // If Toggl key is not set up, don't stay on hours tab
  useEffect(() => {
    if (!hasTogglKey && activeTab === "hours") {
      handleTabClick("salaries");
    }
  }, [hasTogglKey, activeTab]);

  // Salary modal
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState<boolean>(false);
  const [salaryToEdit, setSalaryToEdit] = useState<EmployeeSalary | null>(null);

  // Vacation modal
  const [isVacationModalOpen, setIsVacationModalOpen] = useState<boolean>(false);
  const [vacationToEdit, setVacationToEdit] = useState<EmployeeVacation | null>(null);

  // Time tracking (Toggl) month/year selector
  const currentDate = new Date();
  const [togglYear, setTogglYear] = useState<number>(currentDate.getFullYear());
  const [togglMonth, setTogglMonth] = useState<number>(currentDate.getMonth() + 1);

  // Toggl hours data state
  const [loadingHours, setLoadingHours] = useState<boolean>(false);
  const [hoursData, setHoursData] = useState<TimesheetHoursData | null>(null);
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
    const userIdParam = encodeURIComponent(employee.timeTrackingUserId || "");
    fetch(`/api/time_tracking.php?action=fetch_employee_hours&employee_id=${empIdParam}&user_id=${userIdParam}&year=${togglYear}&month=${togglMonth}`, {
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

  // Salary type label helper
  const salaryTypeLabel = useMemo(() => {
    if (employee.salaryType === "hourly") return t("hour", "hodina", "óra");
    if (employee.salaryType === "daily") return t("day", "deň", "nap");
    return t("month", "mesiac", "hónap");
  }, [employee.salaryType, systemLanguage]);

  // Sensitive data visibility toggle (saved in localStorage)
  const [isSensitiveHidden, setIsSensitiveHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("ccrm_employee_hide_sensitive") === "true";
    } catch {
      return false;
    }
  });

  const toggleSensitiveHidden = () => {
    setIsSensitiveHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ccrm_employee_hide_sensitive", String(next));
      } catch {}
      return next;
    });
  };

  // Check if URL currently has /edit
  const isUrlEdit = useMemo(() => {
    if (typeof window === "undefined") return false;
    const raw = window.location.hash.toLowerCase();
    return raw.includes("/edit");
  }, []);

  // Card in-place edit mode state
  const [isEditingCard, setIsEditingCard] = useState<boolean>(() => !!initialEditMode || isUrlEdit);

  useEffect(() => {
    if (initialEditMode) {
      setIsEditingCard(true);
    }
  }, [initialEditMode]);

  // Form field states for in-place editing
  const [editName, setEditName] = useState<string>(employee.name || "");
  const [editRole, setEditRole] = useState<string>(employee.role || "");
  const [editPin, setEditPin] = useState<string>(employee.pin || "");
  const [editEmail, setEditEmail] = useState<string>(employee.email || "");
  const [editPhone, setEditPhone] = useState<string>(employee.phone || "");
  const [editIsActive, setEditIsActive] = useState<boolean>(employee.isActive !== false);

  const [editStreet, setEditStreet] = useState<string>(employee.addressStreet || "");
  const [editCity, setEditCity] = useState<string>(employee.addressCity || "");
  const [editZip, setEditZip] = useState<string>(employee.addressZip || "");
  const [editCountry, setEditCountry] = useState<string>(employee.addressCountry || "Slovakia");

  const [editSalaryType, setEditSalaryType] = useState<"monthly" | "daily" | "hourly">(employee.salaryType || "monthly");
  const [editSalaryAmount, setEditSalaryAmount] = useState<number | string>(employee.salaryAmount || 0);
  const [editSalaryDueDay, setEditSalaryDueDay] = useState<string>(
    employee.salaryDueDay !== null && employee.salaryDueDay !== undefined ? String(employee.salaryDueDay) : ""
  );

  const [editTimeTrackingUserId, setEditTimeTrackingUserId] = useState<string>(
    employee.timeTrackingUserId ? String(employee.timeTrackingUserId) : ""
  );
  const [editTimeTrackingUserName, setEditTimeTrackingUserName] = useState<string>(employee.timeTrackingUserName || "");
  const [editAutoExpense, setEditAutoExpense] = useState<boolean>(
    employee.autoExpense !== undefined ? !!employee.autoExpense : !!settings.autoExpense
  );
  const [editExpenseCategoryId, setEditExpenseCategoryId] = useState<string>(
    employee.expenseCategoryId || settings.expenseCategoryId || ""
  );

  const [editVacationAllowances, setEditVacationAllowances] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    vacationTypes.forEach((vt) => {
      map[vt.id] =
        employee.vacationAllowances?.[vt.id] !== undefined
          ? employee.vacationAllowances[vt.id]
          : (vt.defaultAllowance ?? vt.defaultDays ?? 25);
    });
    return map;
  });

  const [editNotes, setEditNotes] = useState<string>(employee.notes || "");
  const [cardSaveError, setCardSaveError] = useState<string | null>(null);
  const [isSavingCard, setIsSavingCard] = useState<boolean>(false);

  // Sync form fields when employee prop changes
  const resetEditFields = () => {
    setEditName(employee.name || "");
    setEditRole(employee.role || "");
    setEditPin(employee.pin || "");
    setEditEmail(employee.email || "");
    setEditPhone(employee.phone || "");
    setEditIsActive(employee.isActive !== false);

    setEditStreet(employee.addressStreet || "");
    setEditCity(employee.addressCity || "");
    setEditZip(employee.addressZip || "");
    setEditCountry(employee.addressCountry || "Slovakia");

    setEditSalaryType(employee.salaryType || "monthly");
    setEditSalaryAmount(employee.salaryAmount || 0);
    setEditSalaryDueDay(
      employee.salaryDueDay !== null && employee.salaryDueDay !== undefined ? String(employee.salaryDueDay) : ""
    );

    setEditTimeTrackingUserId(employee.timeTrackingUserId ? String(employee.timeTrackingUserId) : "");
    setEditTimeTrackingUserName(employee.timeTrackingUserName || "");
    setEditAutoExpense(employee.autoExpense !== undefined ? !!employee.autoExpense : !!settings.autoExpense);
    setEditExpenseCategoryId(employee.expenseCategoryId || settings.expenseCategoryId || "");

    const map: Record<string, number> = {};
    vacationTypes.forEach((vt) => {
      map[vt.id] =
        employee.vacationAllowances?.[vt.id] !== undefined
          ? employee.vacationAllowances[vt.id]
          : (vt.defaultAllowance ?? vt.defaultDays ?? 25);
    });
    setEditVacationAllowances(map);

    setEditNotes(employee.notes || "");
    setCardSaveError(null);
  };

  useEffect(() => {
    resetEditFields();
  }, [employee, vacationTypes]);

  // Fetch Toggl workspace users if credentials exist and card is in edit mode
  const [togglUsers, setTogglUsers] = useState<Array<{ id: number; name: string; email: string }>>([]);
  useEffect(() => {
    if (!isEditingCard || !hasTogglKey) return;
    let isMounted = true;
    fetch(`/api/time_tracking.php?action=fetch_workspace_users`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && Array.isArray(data.data)) {
          setTogglUsers(data.data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [isEditingCard, hasTogglKey]);

  const handleStartEdit = () => {
    setIsEditingCard(true);
    setCardSaveError(null);
    if (typeof window !== "undefined") {
      const raw = window.location.hash;
      const [path, query] = raw.split("?");
      if (!path.endsWith("/edit")) {
        const q = query ? `?${query}` : "";
        window.location.hash = `${path}/edit${q}`;
      }
    }
  };

  const handleCancelCard = () => {
    resetEditFields();
    setIsEditingCard(false);
    if (typeof window !== "undefined" && window.location.hash.includes("/edit")) {
      const [path, query] = window.location.hash.split("?");
      const cleanPath = path.replace(/\/edit\b/i, "");
      const q = query ? `?${query}` : "";
      window.location.hash = `${cleanPath}${q}`;
    }
  };

  const handleSaveCard = () => {
    if (!editName.trim()) {
      setCardSaveError(t("Employee name is required", "Meno zamestnanca je povinné", "A munkatárs neve kötelező"));
      return;
    }
    setIsSavingCard(true);
    try {
      const updated: Employee = {
        ...employee,
        name: editName.trim(),
        role: editRole.trim() || undefined,
        pin: editPin.trim() || null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        isActive: editIsActive,
        addressStreet: editStreet.trim() || null,
        addressCity: editCity.trim() || null,
        addressZip: editZip.trim() || null,
        addressCountry: editCountry.trim() || null,
        salaryType: editSalaryType,
        salaryAmount: Number(editSalaryAmount) || 0,
        salaryDueDay: editSalaryDueDay ? Number(editSalaryDueDay) : null,
        timeTrackingUserId: editTimeTrackingUserId || null,
        timeTrackingUserName: editTimeTrackingUserName || null,
        autoExpense: editAutoExpense,
        expenseCategoryId: editExpenseCategoryId || null,
        vacationAllowances: editVacationAllowances,
        notes: editNotes.trim() || null,
        updatedAt: new Date().toISOString()
      };

      onUpdateEmployee(updated);
      setIsEditingCard(false);

      if (typeof window !== "undefined" && window.location.hash.includes("/edit")) {
        const [path, query] = window.location.hash.split("?");
        const cleanPath = path.replace(/\/edit\b/i, "");
        const q = query ? `?${query}` : "";
        window.location.hash = `${cleanPath}${q}`;
      }
    } finally {
      setIsSavingCard(false);
    }
  };

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
      </div>

      {/* Main Split Layout: Left Profile & Documents, Right 3 Sub-Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Profile Info & Contracts (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Profile Card (Display Mode or In-Place Edit Mode) */}
          {isEditingCard ? (
            /* IN-PLACE EDIT MODE */
            <div className="glass-panel rounded-3xl border-2 border-[#c29b62]/40 bg-white/95 shadow-glass p-5 space-y-4 animate-in fade-in duration-200">
              {/* Edit Mode Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#c29b62]/15 border border-[#c29b62]/30 text-[#9e7638] flex items-center justify-center font-bold text-sm shrink-0">
                    <Edit3 className="w-4 h-4 text-[#c29b62]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 leading-tight truncate">
                      {t("Edit Employee", "Upraviť zamestnanca", "Alkalmazott szerkesztése")}
                    </h3>
                    <p className="text-[10px] text-slate-400 truncate">{employee.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCancelCard}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t("Cancel", "Zrušiť", "Mégse")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCard}
                    disabled={isSavingCard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white text-xs font-bold shadow-sm hover:shadow transition cursor-pointer disabled:opacity-50"
                  >
                    {isSavingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{t("Save", "Uložiť", "Mentés")}</span>
                  </button>
                </div>
              </div>

              {cardSaveError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cardSaveError}</span>
                </div>
              )}

              <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {/* 1. Personal & Contact Information (Edit) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-[#c29b62]" />
                      {t("Personal & Contact Information", "Osobné a kontaktné údaje", "Személyes és kapcsolat")}
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsActive}
                        onChange={(e) => setEditIsActive(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#c29b62] rounded"
                      />
                      <span className="text-[11px] font-bold text-slate-700">{t("Active", "Aktívny", "Aktív")}</span>
                    </label>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                        {t("Full Name", "Celé meno", "Teljes név")} *
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                        placeholder="Bc. Peter Varga"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Role / Position", "Pozícia", "Pozíció")}
                        </label>
                        <input
                          type="text"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                          placeholder="Developer"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("PIN / RČ", "Rodné číslo", "Személyi szám")}
                        </label>
                        <input
                          type="text"
                          value={editPin}
                          onChange={(e) => setEditPin(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none font-mono"
                          placeholder="950122/8104"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Email", "Email", "Email")}
                        </label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                          placeholder="peter@cstudios.sk"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Phone", "Telefón", "Telefonszám")}
                        </label>
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                          placeholder="+421 9..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Vacation Quotas (Edit) */}
                <div className="space-y-2 pt-2.5 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                    <Calendar className="w-3 h-3 text-[#c29b62]" />
                    {t("Vacation Quotas (Annual Days)", "Dovolenkové kvóty (ročné nároky v dňoch)", "Szabadság kvóták (éves napok)")}
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    {vacationTypes.map((vt) => (
                      <div key={vt.id} className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: vt.color || "#c29b62" }} />
                          <span className="truncate">{vt.name}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max="365"
                            value={editVacationAllowances[vt.id] ?? vt.defaultAllowance ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setEditVacationAllowances((prev) => ({ ...prev, [vt.id]: val }));
                            }}
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-mono font-bold focus:border-[#c29b62] focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">{t("days", "dní", "nap")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Permanent Residence & Address (Edit) */}
                <div className="space-y-2 pt-2.5 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                    <MapPin className="w-3 h-3 text-[#c29b62]" />
                    {t("Permanent Residence & Address", "Trvalé bydlisko a adresa", "Állandó lakcím és cím")}
                  </span>

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                        {t("Street & Number", "Ulica a číslo", "Utca és házszám")}
                      </label>
                      <input
                        type="text"
                        value={editStreet}
                        onChange={(e) => setEditStreet(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                        placeholder="Štefánikova 12"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("City", "Mesto", "Város")}
                        </label>
                        <input
                          type="text"
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                          placeholder="Nitra"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("ZIP Code", "PSČ", "Irányítószám")}
                        </label>
                        <input
                          type="text"
                          value={editZip}
                          onChange={(e) => setEditZip(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none font-mono"
                          placeholder="949 01"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                        {t("Country", "Krajina", "Ország")}
                      </label>
                      <input
                        type="text"
                        value={editCountry}
                        onChange={(e) => setEditCountry(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                        placeholder="Slovakia"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Salary & Compensation Terms (Edit) */}
                <div className="space-y-2 pt-2.5 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                    <Coins className="w-3 h-3 text-[#c29b62]" />
                    {t("Salary & Compensation Terms", "Mzdové a kompenzačné podmienky", "Bérezési feltételek")}
                  </span>

                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Salary Amount", "Výška mzdy", "Bér összege")} ({systemCurrency})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={editSalaryAmount}
                          onChange={(e) => setEditSalaryAmount(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Period", "Perióda", "Időszak")}
                        </label>
                        <select
                          value={editSalaryType}
                          onChange={(e) => setEditSalaryType(e.target.value as any)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none font-medium"
                        >
                          <option value="monthly">{t("Monthly", "Mesačne", "Havonta")}</option>
                          <option value="daily">{t("Daily", "Denne", "Naponta")}</option>
                          <option value="hourly">{t("Hourly", "Hodinovo", "Óránként")}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Salary Due Day", "Výplatný deň", "Kifizetési nap")}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={editSalaryDueDay}
                          onChange={(e) => setEditSalaryDueDay(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none font-mono"
                          placeholder={String(settings.salaryDueDay ?? 15)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Toggl User Link", "Prepojenie Toggl", "Toggl kapcsolat")}
                        </label>
                        {togglUsers.length > 0 ? (
                          <select
                            value={editTimeTrackingUserId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditTimeTrackingUserId(val);
                              const found = togglUsers.find((u) => String(u.id) === val);
                              if (found) {
                                setEditTimeTrackingUserName(found.name || found.email);
                              } else if (!val) {
                                setEditTimeTrackingUserName("");
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none truncate"
                          >
                            <option value="">{t("Not mapped", "Neprepojené", "Nincs összerendelve")}</option>
                            {togglUsers.map((u) => (
                              <option key={u.id} value={String(u.id)}>
                                {u.name || u.email}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={editTimeTrackingUserName || editTimeTrackingUserId}
                            onChange={(e) => {
                              setEditTimeTrackingUserName(e.target.value);
                              setEditTimeTrackingUserId(e.target.value);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                            placeholder={t("User ID or name", "ID alebo meno", "ID vagy név")}
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editAutoExpense}
                          onChange={(e) => setEditAutoExpense(e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#c29b62] rounded"
                        />
                        <span className="text-[11px] font-semibold text-slate-700">
                          {t("Auto-sync salary to financial expenses", "Auto výdavok do financií", "Auto kiadás szinkron")}
                        </span>
                      </label>
                    </div>

                    {financialCategories.length > 0 && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                          {t("Expense Category", "Kategória výdavku", "Kiadási kategória")}
                        </label>
                        <select
                          value={editExpenseCategoryId}
                          onChange={(e) => setEditExpenseCategoryId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none"
                        >
                          <option value="">{t("Select Category...", "Vyberte kategóriu...", "Kategória kiválasztása...")}</option>
                          {financialCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Internal Notes & Observations (Edit) */}
                <div className="space-y-1.5 pt-2.5 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                    <FileText className="w-3 h-3 text-[#c29b62]" />
                    {t("Internal Notes & Observations", "Interné poznámky a postrehy", "Belső feljegyzések")}
                  </span>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-[#c29b62] focus:outline-none resize-none leading-relaxed"
                    placeholder={t(
                      "Internal notes, contract milestones, observations...",
                      "Interné poznámky k zamestnancovi...",
                      "Belső megjegyzések..."
                    )}
                  />
                </div>
              </div>

              {/* Bottom Actions in Edit Mode */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelCard}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveCard}
                  disabled={isSavingCard}
                  className="flex-[2] py-2 rounded-xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white text-xs font-bold shadow-md shadow-[#c29b62]/20 hover:shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}</span>
                </button>
              </div>
            </div>
          ) : (
            /* DISPLAY MODE (5 Sections + Header with Eye & Edit + Files Shortcut) */
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 space-y-5">
              {/* Header: Avatar, Name, Status, Eye Toggle & Edit Buttons */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="w-14 h-14 rounded-2xl bg-[#c29b62]/15 border border-[#c29b62]/30 text-[#9e7638] dark:text-[#d4af7a] flex items-center justify-center font-bold text-xl shrink-0 shadow-sm">
                    {employee.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-900 truncate">
                        {employee.name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          employee.isActive !== false
                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {employee.isActive !== false ? t("Active", "Aktívny", "Aktív") : t("Inactive", "Neaktívny", "Inaktív")}
                      </span>
                    </div>

                    {employee.role && (
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        {employee.role}
                      </p>
                    )}

                    {/* Salary badge pill */}
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#c29b62]/10 border border-[#c29b62]/20 text-[#9e7638] dark:text-[#d4af7a] text-xs font-semibold">
                      <Coins className="w-3.5 h-3.5 text-[#c29b62]" />
                      {isSensitiveHidden ? (
                        <span className="font-mono tracking-widest text-slate-400 select-none">
                          •••••• / {salaryTypeLabel}
                        </span>
                      ) : (
                        <span>
                          {(employee.salaryAmount || 0).toLocaleString()} {systemCurrency} / {salaryTypeLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Header Action Buttons: Eye Toggle (Sensitive Data) & Edit Profile */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={toggleSensitiveHidden}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border transition cursor-pointer shrink-0 shadow-sm ${
                      isSensitiveHidden
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-700 hover:bg-amber-500/20"
                        : "bg-slate-100/90 hover:bg-[#c29b62]/15 text-slate-600 hover:text-[#9e7638] dark:hover:text-[#d4af7a] border-slate-200/80 hover:border-[#c29b62]/30"
                    }`}
                    title={
                      isSensitiveHidden
                        ? t("Show sensitive data (salary, vacations, notes)", "Zobraziť citlivé údaje", "Érzékeny adatok megjelenítése")
                        : t("Hide sensitive data (salary, vacations, notes)", "Skryť citlivé údaje", "Érzékeny adatok elrejtése")
                    }
                  >
                    {isSensitiveHidden ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[11px] font-bold text-amber-700">{t("Hidden", "Skryté", "Rejtett")}</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[11px] font-bold">{t("Hide", "Skryť", "Elrejtés")}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-[#c29b62]/15 text-slate-600 hover:text-[#9e7638] dark:hover:text-[#d4af7a] border border-slate-200/80 hover:border-[#c29b62]/30 transition cursor-pointer shrink-0 shadow-sm group"
                    title={t("Edit Profile", "Upraviť profil", "Profil szerkesztése")}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#c29b62] group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold">{t("Edit", "Upraviť", "Szerkesztés")}</span>
                  </button>
                </div>
              </div>

              {/* 1. PERSONAL & CONTACT INFORMATION */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  <User className="w-3.5 h-3.5 text-[#c29b62]" />
                  <span>{t("Personal & Contact Information", "Osobné a kontaktné údaje", "Személyes és kapcsolat adatok")}</span>
                </div>

                {employee.pin && (
                  <div className="flex items-center justify-between pl-5">
                    <span className="text-slate-400">{t("PIN / RČ", "Rodné číslo", "Személyi szám")}:</span>
                    {isSensitiveHidden ? (
                      <span className="font-mono text-slate-400 tracking-widest font-bold select-none">
                        ••••••/••••
                      </span>
                    ) : (
                      <span className="font-mono text-slate-800 font-semibold">{employee.pin}</span>
                    )}
                  </div>
                )}

                {employee.email && (
                  <div className="flex items-center gap-2.5 text-slate-600 pl-5">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href={`mailto:${employee.email}`} className="hover:text-[#c29b62] truncate">
                      {employee.email}
                    </a>
                  </div>
                )}

                {employee.phone && (
                  <div className="flex items-center gap-2.5 text-slate-600 pl-5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href={`tel:${employee.phone}`} className="hover:text-[#c29b62]">
                      {employee.phone}
                    </a>
                  </div>
                )}

                {!employee.pin && !employee.email && !employee.phone && (
                  <p className="text-xs text-slate-400 italic pl-5">
                    {t("No contact details specified", "Kontaktné údaje nezadané", "Nincsenek megadott elérhetőségek")}
                  </p>
                )}
              </div>

              {/* 2. VACATION QUOTAS - AND THEIR USAGE */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-[#c29b62]" />
                    <span>{t("Vacation Quotas & Usage", "Dovolenkové kvóty a čerpanie", "Szabadság kvóták és felhasználás")}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    {calYear}
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {vacationTypes.map((vt) => {
                    const stats = vacationStats[vt.id] || {
                      used: 0,
                      allowance: employee.vacationAllowances?.[vt.id] ?? vt.defaultAllowance ?? 25,
                      name: vt.name,
                      color: vt.color || "#c29b62"
                    };
                    const allowance = stats.allowance || 0;
                    const used = stats.used || 0;
                    const remaining = Math.max(0, allowance - used);
                    const percent = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;

                    return (
                      <div key={vt.id} className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/60 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: vt.color || "#c29b62" }}
                            />
                            {vt.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {isSensitiveHidden ? (
                              <span className="font-mono text-slate-400 tracking-widest text-[11px] select-none">
                                •• / •• {t("days", "dní", "nap")}
                              </span>
                            ) : (
                              <span className="font-mono text-slate-800 font-bold text-[11px]">
                                {used} / {allowance} {t("days", "dní", "nap")}
                              </span>
                            )}
                            {isSensitiveHidden ? (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-500 select-none">
                                ••
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  remaining === 0
                                    ? "bg-red-500/10 text-red-600 border border-red-500/20"
                                    : "bg-[#c29b62]/10 text-[#9e7638] dark:text-[#d4af7a] border border-[#c29b62]/20"
                                }`}
                              >
                                {remaining} {t("left", "zostáva", "maradt")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Usage Progress Bar */}
                        {isSensitiveHidden ? (
                          <div className="w-full h-1.5 bg-slate-200/50 rounded-full" />
                        ) : (
                          <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${percent}%`,
                                backgroundColor: vt.color || "#c29b62"
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. PERMANENT RESIDENCE & ADDRESS */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-[#c29b62]" />
                  <span>{t("Permanent Residence & Address", "Trvalé bydlisko a adresa", "Állandó lakcím és cím")}</span>
                </div>

                {employee.addressStreet || employee.addressCity || employee.addressZip ? (
                  <div className="text-xs text-slate-700 pl-5 space-y-0.5">
                    {employee.addressStreet && <p className="font-medium text-slate-800">{employee.addressStreet}</p>}
                    <p className="text-slate-600">
                      {employee.addressZip ? `${employee.addressZip} ` : ""}
                      {employee.addressCity || ""}
                      {employee.addressCountry ? ` (${employee.addressCountry})` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic pl-5">
                    {t("Address not specified", "Adresa nezadaná", "Cím nincs megadva")}
                  </p>
                )}
              </div>

              {/* 4. SALARY & COMPENSATION TERMS */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  <Coins className="w-3.5 h-3.5 text-[#c29b62]" />
                  <span>{t("Salary & Compensation Terms", "Mzdové a kompenzačné podmienky", "Bérezési feltételek")}</span>
                </div>

                <div className="flex items-center justify-between pl-5">
                  <span className="text-slate-400">{t("Base Rate", "Základná sadzba", "Alapbér")}:</span>
                  {isSensitiveHidden ? (
                    <span className="font-mono text-slate-400 tracking-widest font-bold select-none">
                      •••••• / {salaryTypeLabel}
                    </span>
                  ) : (
                    <span className="font-bold text-slate-800 font-mono">
                      {(employee.salaryAmount || 0).toLocaleString()} {systemCurrency} / {salaryTypeLabel}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pl-5">
                  <span className="text-slate-400">{t("Salary Due Day", "Výplatný deň", "Kifizetési nap")}:</span>
                  {isSensitiveHidden ? (
                    <span className="font-mono text-slate-400 tracking-widest font-bold select-none">
                      ••. {t("of month", "v mesiaci", "a hónapban")}
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-800">
                      {employee.salaryDueDay
                        ? `${employee.salaryDueDay}. ${t("of month", "v mesiaci", "a hónapban")}`
                        : `${settings.salaryDueDay ?? 15}. ${t("(default)", "(predvolený)", "(alapértelmezett)")}`}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pl-5">
                  <span className="text-slate-400">{t("Time Tracking", "Meranie času", "Időkövetés")}:</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate max-w-[190px]">
                    <Clock className="w-3.5 h-3.5 text-[#c29b62] shrink-0" />
                    <span className="truncate">
                      {employee.timeTrackingUserName ||
                        (employee.timeTrackingUserId ? `ID: ${employee.timeTrackingUserId}` : t("Not mapped", "Neprepojené", "Nincs összerendelve"))}
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between pl-5">
                  <span className="text-slate-400">{t("Auto-Expense Sync", "Auto výdavok do financií", "Auto kiadás szinkron")}:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                      employee.autoExpense ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {employee.autoExpense ? t("Active", "Aktívny", "Aktív") : t("Disabled", "Vypnuté", "Kikapcsolva")}
                  </span>
                </div>
              </div>

              {/* 5. INTERNAL NOTES & OBSERVATIONS */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <FileText className="w-3.5 h-3.5 text-[#c29b62]" />
                  <span>{t("Internal Notes & Observations", "Interné poznámky a postrehy", "Belső feljegyzések")}</span>
                </div>

                {isSensitiveHidden ? (
                  <div className="space-y-1.5 py-1 select-none pl-5">
                    <div className="font-mono text-xs text-slate-400/90 tracking-widest select-none break-all leading-relaxed">
                      ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
                    </div>
                    <div className="h-2 bg-slate-200/70 rounded-full w-4/5" />
                    <div className="h-2 bg-slate-200/50 rounded-full w-3/5" />
                  </div>
                ) : employee.notes ? (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed pl-5">
                    {employee.notes}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic pl-5">
                    {t("No notes recorded", "Žiadne poznámky", "Nincsenek feljegyzések")}
                  </p>
                )}
              </div>

              {/* Quick Link to Contracts & Documents */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleTabClick("files")}
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
          )}
        </div>

        {/* RIGHT COLUMN: 3 SUB-TABS (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Sub-Tabs Navigation */}
          <div className="flex items-center gap-2 p-1.5 glass-panel rounded-2xl border border-white/60 bg-white/80 shadow-sm">
            {hasTogglKey && (
              <button
                onClick={() => handleTabClick("hours")}
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
              onClick={() => handleTabClick("salaries")}
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
              onClick={() => handleTabClick("vacations")}
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
              onClick={() => handleTabClick("files")}
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
            <EmployeeTimesheetSummary
              employee={employee}
              hoursData={hoursData}
              loading={loadingHours}
              error={hoursError}
              togglYear={togglYear}
              togglMonth={togglMonth}
              onPrevMonth={() => {
                if (togglMonth === 1) {
                  setTogglMonth(12);
                  setTogglYear((y) => y - 1);
                } else {
                  setTogglMonth((m) => m - 1);
                }
              }}
              onNextMonth={() => {
                if (togglMonth === 12) {
                  setTogglMonth(1);
                  setTogglYear((y) => y + 1);
                } else {
                  setTogglMonth((m) => m + 1);
                }
              }}
              onCurrentMonth={() => {
                const now = new Date();
                setTogglYear(now.getFullYear());
                setTogglMonth(now.getMonth() + 1);
              }}
              systemCurrency={systemCurrency}
              t={t}
              onLinkTogglUser={handleStartEdit}
            />
          )}

          {/* TAB 2: SALARIES & PAYMENTS HISTORY */}
          {activeTab === "salaries" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-6 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

                  <button
                    type="button"
                    onClick={() => {
                      setSalaryToEdit(null);
                      setIsSalaryModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white text-xs font-bold shadow-md shadow-[#c29b62]/20 hover:shadow-lg transition cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t("Add Salary", "Pridať mzdu", "Bér hozzáadása")}</span>
                  </button>
                </div>

                {employeeSalaries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-slate-200/80 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center gap-3">
                    <p className="max-w-md">
                      {t(
                        "No salary records created for this employee yet. You can add a salary payout here or use the Salaries Matrix.",
                        "Pre tohto zamestnanca zatiaľ neboli zaevidované žiadne mzdy. Môžete pridať mzdu priamo tu alebo v Matici miezd.",
                        "Még nincsenek rögzített bérek ehhez az alkalmazotthoz. Itt hozzáadhat egy kifizetést vagy használhatja a Bérmátrixot."
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSalaryToEdit(null);
                        setIsSalaryModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c29b62] hover:bg-[#b58b4c] text-white text-xs font-bold shadow transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t("Add First Salary", "Pridať prvú mzdu", "Első bér hozzáadása")}
                    </button>
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
                          <th className="py-2.5 px-3 text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {employeeSalaries.map((sal) => {
                          const isFullyPaid = sal.totalPaid >= sal.totalSalary && sal.totalSalary > 0;
                          const isPartial = sal.totalPaid > 0 && !isFullyPaid;

                          return (
                            <tr
                              key={sal.id}
                              onClick={() => {
                                setSalaryToEdit(sal);
                                setIsSalaryModalOpen(true);
                              }}
                              className="hover:bg-slate-50/70 transition cursor-pointer group"
                            >
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
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSalaryToEdit(sal);
                                    setIsSalaryModalOpen(true);
                                  }}
                                  title={t("Edit Salary", "Upraviť mzdu", "Bér szerkesztése")}
                                  className="p-1.5 text-slate-400 group-hover:text-[#c29b62] hover:bg-[#c29b62]/10 rounded-lg transition cursor-pointer inline-flex items-center justify-center"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
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

      {/* Salary Modal */}
      {isSalaryModalOpen && (
        <SalaryCellDrawer
          employee={employee}
          existingRecord={salaryToEdit}
          settings={settings}
          canChangePeriod={true}
          onClose={() => {
            setIsSalaryModalOpen(false);
            setSalaryToEdit(null);
          }}
          onSave={(savedSalary) => {
            if (onSaveSalary) {
              onSaveSalary(savedSalary);
            }
            setIsSalaryModalOpen(false);
            setSalaryToEdit(null);
          }}
          systemLanguage={systemLanguage}
          systemCurrency={systemCurrency}
        />
      )}
    </div>
  );
};

export default EmployeeDetailView;
