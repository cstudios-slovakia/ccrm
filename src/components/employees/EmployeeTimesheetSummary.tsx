import React, { useState, useMemo } from "react";
import {
  Clock,
  Calendar,
  CalendarDays,
  BarChart3,
  ListFilter,
  Coins,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  AlertCircle,
  Layers,
  CheckCircle2,
  UserX,
} from "lucide-react";
import type { Employee } from "../../types";
import { formatNumber } from "../../utils/currency";

/**
 * Format fractional hours into "X h Y m" format without decimals.
 * e.g., 6.5 -> "6 h 30 m", 32.2 -> "32 h 12 m", 7.0 -> "7 h 0 m", 0 -> "0 h 0 m"
 */
export const formatDurationHoursMinutes = (hours: number): string => {
  if (!hours || isNaN(hours) || hours <= 0) return "0 h 0 m";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} h ${m} m`;
};

export interface DayData {
  date: string;
  day_number: number;
  dayNumber?: number;
  weekday: string;
  is_current_month: boolean;
  isCurrentMonth?: boolean;
  is_weekend: boolean;
  isWeekend?: boolean;
  hours: number;
  seconds: number;
  worked_days?: number;
  projects?: Record<string, number>;
}

export interface CalendarWeekData {
  week_number: number;
  weekNum?: number;
  label: string;
  start_date: string;
  startDate?: string;
  end_date: string;
  endDate?: string;
  total_seconds?: number;
  total_hours?: number;
  hours?: number;
  month_seconds?: number;
  month_hours?: number;
  active_days?: number;
  activeDays?: number;
  worked_days?: number;
  workedDays?: number;
  days: DayData[];
}

export interface DailyLogItem {
  date: string;
  day_number: number;
  dayNumber?: number;
  weekday: string;
  is_weekend: boolean;
  isWeekend?: boolean;
  hours: number;
  seconds: number;
  worked_days: number;
  status: "worked" | "weekend" | "off";
  projects?: Record<string, number>;
}

export interface TimesheetHoursData {
  totalHours: number;
  activeDays?: number;
  standardDays?: number;
  avgDailyHours?: number;
  avgWeeklyHours?: number;
  weekly?: Record<string, any>;
  calendarWeeks?: CalendarWeekData[];
  daily?: Record<string, number>;
  dailyProjects?: Record<string, Record<string, number>>;
  dailyLog?: DailyLogItem[];
  projects?: Record<string, number>;
}

interface EmployeeTimesheetSummaryProps {
  employee: Employee;
  hoursData: TimesheetHoursData | null;
  loading: boolean;
  error: string | null;
  togglYear: number;
  togglMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  systemLanguage?: string;
  systemCurrency: string;
  t: (en: string, sk: string, hu: string) => string;
  onLinkTogglUser?: () => void;
}

type ViewMode = "matrix" | "weekly" | "daily" | "projects";

export const EmployeeTimesheetSummary: React.FC<EmployeeTimesheetSummaryProps> = ({
  employee,
  hoursData,
  loading,
  error,
  togglYear,
  togglMonth,
  onPrevMonth,
  onNextMonth,
  onCurrentMonth,
  systemLanguage = "sk",
  systemCurrency,
  t,
  onLinkTogglUser,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");
  const [dailyFilter, setDailyFilter] = useState<"all" | "worked" | "weekdays">("all");
  const [hoveredDayDate, setHoveredDayDate] = useState<string | null>(null);

  // Month formatted title
  const monthDate = useMemo(() => new Date(togglYear, togglMonth - 1, 1), [togglYear, togglMonth]);
  const monthName = useMemo(() => {
    return monthDate.toLocaleString("en-US", { month: "long" });
  }, [monthDate]);

  // Derived calendar weeks if not returned by backend
  const calendarWeeks: CalendarWeekData[] = useMemo(() => {
    if (hoursData?.calendarWeeks && hoursData.calendarWeeks.length > 0) {
      return hoursData.calendarWeeks;
    }

    // Fallback client-side builder
    const firstDay = new Date(togglYear, togglMonth - 1, 1);
    const firstDow = (firstDay.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const calStart = new Date(togglYear, togglMonth - 1, 1 - firstDow);

    const weeks: CalendarWeekData[] = [];
    const cur = new Date(calStart);
    let weekIndex = 1;

    for (let w = 0; w < 6; w++) {
      const days: DayData[] = [];
      let weekSec = 0;
      let activeDays = 0;
      const weekStartStr = cur.toISOString().slice(0, 10);

      for (let d = 0; d < 7; d++) {
        const dStr = cur.toISOString().slice(0, 10);
        const isCurrentMonth = cur.getMonth() === togglMonth - 1;
        const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
        const dHours = hoursData?.daily?.[dStr] || 0;
        const dSec = Math.round(dHours * 3600);

        weekSec += dSec;
        if (dHours > 0) activeDays++;

        days.push({
          date: dStr,
          day_number: cur.getDate(),
          dayNumber: cur.getDate(),
          weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(cur.getDay() + 6) % 7],
          is_current_month: isCurrentMonth,
          isCurrentMonth: isCurrentMonth,
          is_weekend: isWeekend,
          isWeekend: isWeekend,
          hours: dHours,
          seconds: dSec,
          worked_days: dHours >= 6 ? 1.0 : dHours > 0 ? 0.5 : 0,
          projects: hoursData?.dailyProjects?.[dStr],
        });

        cur.setDate(cur.getDate() + 1);
      }

      const weekEndStr = days[6].date;
      const wHours = Number((weekSec / 3600).toFixed(2));

      weeks.push({
        week_number: weekIndex,
        weekNum: weekIndex,
        label: `Week ${weekIndex} (${weekStartStr.slice(5)} – ${weekEndStr.slice(5)})`,
        start_date: weekStartStr,
        startDate: weekStartStr,
        end_date: weekEndStr,
        endDate: weekEndStr,
        total_seconds: weekSec,
        total_hours: wHours,
        hours: wHours,
        active_days: activeDays,
        worked_days: Number((weekSec / (8 * 3600)).toFixed(1)),
        days,
      });

      weekIndex++;
      // Stop if next week is entirely in next month
      if (cur.getMonth() !== togglMonth - 1 && cur.getDate() > 7) {
        break;
      }
    }

    return weeks;
  }, [hoursData, togglYear, togglMonth]);

  // Derived daily log
  const dailyLog: DailyLogItem[] = useMemo(() => {
    if (hoursData?.dailyLog && hoursData.dailyLog.length > 0) {
      return hoursData.dailyLog;
    }
    const daysInMonth = new Date(togglYear, togglMonth, 0).getDate();
    const result: DailyLogItem[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(togglYear, togglMonth - 1, d);
      const dStr = dt.toISOString().slice(0, 10);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const dHours = hoursData?.daily?.[dStr] || 0;
      const dSec = Math.round(dHours * 3600);

      result.push({
        date: dStr,
        day_number: d,
        dayNumber: d,
        weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()],
        is_weekend: isWeekend,
        isWeekend: isWeekend,
        hours: dHours,
        seconds: dSec,
        worked_days: Number((dHours / 8).toFixed(2)),
        status: dHours > 0 ? "worked" : isWeekend ? "weekend" : "off",
        projects: hoursData?.dailyProjects?.[dStr],
      });
    }

    return result;
  }, [hoursData, togglYear, togglMonth]);

  // Filtered daily log
  const filteredDailyLog = useMemo(() => {
    if (dailyFilter === "worked") {
      return dailyLog.filter((item) => item.hours > 0);
    }
    if (dailyFilter === "weekdays") {
      return dailyLog.filter((item) => !item.is_weekend && !item.isWeekend);
    }
    return dailyLog;
  }, [dailyLog, dailyFilter]);

  // Active days count in current month
  const activeDaysCount = useMemo(() => {
    if (typeof hoursData?.activeDays === "number") return hoursData.activeDays;
    return dailyLog.filter((d) => d.hours > 0).length;
  }, [hoursData?.activeDays, dailyLog]);

  // Standard 8h days
  const standardDays = useMemo(() => {
    if (typeof hoursData?.standardDays === "number") return hoursData.standardDays;
    return Number(((hoursData?.totalHours || 0) / 8).toFixed(1));
  }, [hoursData?.standardDays, hoursData?.totalHours]);

  // Average daily hours on active days
  const avgDailyHours = useMemo(() => {
    if (activeDaysCount <= 0) return 0;
    return Number(((hoursData?.totalHours || 0) / activeDaysCount).toFixed(1));
  }, [activeDaysCount, hoursData?.totalHours]);

  // Total compensation calculation
  const calculatedComp = useMemo(() => {
    const total = hoursData?.totalHours || 0;
    const base = employee.salaryAmount || 0;
    if (employee.salaryType === "hourly") {
      return formatNumber(total * base, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return formatNumber(base, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [hoursData?.totalHours, employee.salaryAmount, employee.salaryType]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const hasAttachedUser = Boolean(
    employee.timeTrackingUserId &&
    String(employee.timeTrackingUserId).trim() !== "" &&
    String(employee.timeTrackingUserId).trim() !== "0" &&
    String(employee.timeTrackingUserId).trim() !== "none"
  );

  if (!hasAttachedUser) {
    return (
      <div className="p-8 ws-sm:p-12 text-center glass-panel rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 shadow-glass space-y-4 animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-[#c29b62] dark:text-[#d4af7a] flex items-center justify-center mx-auto shadow-inner">
          <UserX className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h4 className="text-title-sm font-heading font-extrabold text-slate-900 dark:text-slate-100">
            {t("No Selected User", "Nie je vybraný používateľ", "Nincs kiválasztott felhasználó")}
          </h4>
          <p className="text-ui text-slate-500 dark:text-slate-400 leading-relaxed">
            {t(
              "This employee has no Toggl Track or external user account attached. Link a user account in the employee profile to automatically view and track their worked hours.",
              "Tento zamestnanec nemá priradeného žiadneho používateľa pre meranie času. V profile zamestnanca priraďte účet Toggl Track, aby sa zobrazovali jeho odpracované hodiny a výkaz.",
              "Ehhez az alkalmazotthoz nincs hozzárendelve Toggl Track vagy más felhasználói fiók. A munkaidő és az elszámolás megtekintéséhez válasszon ki egy fiókot az alkalmazott profiljában."
            )}
          </p>
        </div>
        {onLinkTogglUser && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onLinkTogglUser}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-ui font-heading font-bold rounded-2xl bg-gradient-to-r from-[#c29b62] to-[#b58b4c] text-white hover:shadow-lg hover:shadow-[#c29b62]/25 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{t("Select User Account", "Vybrať používateľský účet", "Felhasználó kiválasztása")}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header controls: Month navigation & View Switcher */}
      <div className="flex flex-col ws-lg:flex-row ws-lg:items-center justify-between gap-4 p-5 glass-panel rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/90 shadow-glass">
        {/* Month Selector */}
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-1 shadow-inner">
            <button
              onClick={onPrevMonth}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition shadow-xs cursor-pointer"
              title={t("Previous month", "Predchádzajúci mesiac", "Előző hónap")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3.5 py-1 text-center min-w-37.5">
              <span className="text-ui font-bold text-slate-800 dark:text-slate-100">
                {monthName} {togglYear}
              </span>
            </div>
            <button
              onClick={onNextMonth}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition shadow-xs cursor-pointer"
              title={t("Next month", "Nasledujúci mesiac", "Következő hónap")}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onCurrentMonth}
            className="px-3 py-2 text-ui font-semibold rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            {t("Today", "Dnes", "Ma")}
          </button>

          {employee.timeTrackingUserName && (
            <div className="hidden ws-sm:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-ui font-semibold border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{employee.timeTrackingUserName}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-1.5 text-ui text-amber-600 dark:text-amber-400 font-medium animate-pulse ml-1">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>{t("Syncing Toggl...", "Načítavam Toggl...", "Toggl szinkronizálás...")}</span>
            </div>
          )}
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 p-1 shadow-inner self-start ws-lg:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setViewMode("matrix")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-ui font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
              viewMode === "matrix"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-[#c29b62] dark:text-[#d4af7a]" />
            <span>{t("Timesheet Matrix", "Mesačný kalendár", "Havi mátrix")}</span>
          </button>

          <button
            onClick={() => setViewMode("weekly")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-ui font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
              viewMode === "weekly"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>{t("Weekly Breakdown", "Týždenný rozpis", "Heti bontás")}</span>
          </button>

          <button
            onClick={() => setViewMode("daily")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-ui font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
              viewMode === "daily"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ListFilter className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t("Daily Log", "Denný záznam", "Napi napló")}</span>
          </button>

          <button
            onClick={() => setViewMode("projects")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-ui font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
              viewMode === "projects"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{t("Monthly & Projects", "Mesačný súhrn & Projekty", "Havi összesítő & Projektek")}</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 ws-md:grid-cols-4 gap-4">
        {/* Total Worked Hours */}
        <div className="p-5 glass-panel rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95 shadow-glass flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="type-overline">
              {t("Total Worked Hours", "Celkovo odpracované", "Összes ledolgozott óra")}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-title font-bold font-mono text-slate-900 dark:text-white">
              {formatDurationHoursMinutes(hoursData?.totalHours || 0)}
            </span>
          </div>
          <span className="text-micro text-slate-500 dark:text-slate-400 mt-1 block">
            {t("For selected month", "Pre zvolený mesiac", "A kiválasztott hónapban")}
          </span>
        </div>

        {/* Active Days Worked */}
        <div className="p-5 glass-panel rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95 shadow-glass flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="type-overline">
              {t("Active Days Worked", "Aktívne odpracované dni", "Ledolgozott napok száma")}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="type-metric font-mono text-emerald-600 dark:text-emerald-400">
              {formatNumber(activeDaysCount, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            <span className="text-body font-bold text-slate-500 dark:text-slate-400">
              {t("days", "dní", "nap")}
            </span>
          </div>
          <span className="text-micro text-slate-500 dark:text-slate-400 mt-1 block">
            {avgDailyHours > 0
              ? `Ø ${formatDurationHoursMinutes(avgDailyHours)} / ${t("active day", "aktívny deň", "aktív nap")}`
              : "—"}
          </span>
        </div>

        {/* Standard Days Equivalent (8h) */}
        <div className="p-5 glass-panel rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95 shadow-glass flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="type-overline">
              {t("Standard 8h Days", "Ekvivalent 8h dní", "8 órás munkanapok")}
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="type-metric font-mono text-purple-700 dark:text-purple-300">
              {formatNumber(standardDays, systemLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-body font-bold text-slate-500 dark:text-slate-400">
              {t("days", "dní", "nap")}
            </span>
          </div>
          <span className="text-micro text-slate-500 dark:text-slate-400 mt-1 block">
            {t("Hours ÷ 8.0 standard shift", "Hodiny ÷ 8.0 štandardná zmena", "Órák ÷ 8.0 normaidő")}
          </span>
        </div>

        {/* Calculated Monthly Compensation */}
        <div className="p-5 glass-panel rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95 shadow-glass flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="type-overline truncate">
              {employee.salaryType === "hourly"
                ? t("Calculated Pay", "Vypočítaná odmena", "Számított bér")
                : t("Expected Monthly Base", "Základná mesačná sadzba", "Alapbér")}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-[#c29b62] dark:text-[#d4af7a] flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 truncate">
            <span className="text-title font-bold font-mono text-[#9e7638] dark:text-[#d4af7a] truncate">
              {calculatedComp}
            </span>
            <span className="text-ui font-bold text-slate-500 dark:text-slate-400">
              {systemCurrency}
            </span>
          </div>
          <span className="text-micro text-slate-500 dark:text-slate-400 mt-1 block truncate">
            {employee.salaryType === "hourly"
              ? `${formatNumber(employee.salaryAmount, systemLanguage)} ${systemCurrency} / h`
              : t("Fixed monthly compensation", "Pevná mesačná odmena", "Havi fix juttatás")}
          </span>
        </div>
      </div>

      {/* Error display if any */}
      {error && (
        <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 text-ui text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. VIEW 1: TIMESHEET CALENDAR MATRIX (Adapted to CCRM Brand Theme) */}
      {viewMode === "matrix" && (
        <div className="glass-panel rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-[#12161f]/95 shadow-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-190 border-collapse text-left">
              {/* Table Header */}
              <thead>
                <tr className="bg-slate-50/90 dark:bg-black/40 border-b border-slate-200/90 dark:border-white/10 text-ui font-bold text-slate-600 dark:text-slate-300">
                  <th className="py-3.5 px-3 text-center w-[11.5%] text-slate-700 dark:text-slate-300">
                    {t("MON", "PO", "HÉ")}
                  </th>
                  <th className="py-3.5 px-3 text-center w-[11.5%] text-slate-700 dark:text-slate-300">
                    {t("TUE", "UT", "KE")}
                  </th>
                  <th className="py-3.5 px-3 text-center w-[11.5%] text-slate-700 dark:text-slate-300">
                    {t("WED", "ST", "SZE")}
                  </th>
                  <th className="py-3.5 px-3 text-center w-[11.5%] text-slate-700 dark:text-slate-300">
                    {t("THU", "ŠT", "CSÜ")}
                  </th>
                  <th className="py-3.5 px-3 text-center w-[11.5%] text-slate-700 dark:text-slate-300">
                    {t("FRI", "PI", "PÉ")}
                  </th>
                  <th className="py-3.5 px-3 text-center text-slate-400 dark:text-slate-400 bg-slate-100/50 dark:bg-black/25 w-[11.5%]">
                    {t("SAT", "SO", "SZO")}
                  </th>
                  <th className="py-3.5 px-3 text-center text-slate-400 dark:text-slate-400 bg-slate-100/50 dark:bg-black/25 w-[11.5%]">
                    {t("SUN", "NE", "VAS")}
                  </th>
                  <th className="py-3.5 px-4 text-center bg-gradient-to-r from-slate-100/90 to-[#c29b62]/10 dark:from-black/40 dark:to-[#c29b62]/20 text-[#9e7638] dark:text-[#d4af7a] border-l border-slate-200/90 dark:border-white/10 w-[19.5%]">
                    {t("WEEK TOTAL", "SPOLU TÝŽDEŇ", "HETI ÖSSZESEN")}
                  </th>
                </tr>
              </thead>

              {/* Table Body (Weeks) */}
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.07]">
                {calendarWeeks.map((week) => {
                  const weekHours = week.total_hours ?? week.hours ?? 0;
                  const weekActiveDays = week.active_days ?? week.activeDays ?? week.days.filter((d) => d.hours > 0).length;

                  return (
                    <tr
                      key={week.week_number}
                      className="hover:bg-slate-500/5 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      {/* 7 Days of the week */}
                      {week.days.map((day) => {
                        const isCurrent = day.is_current_month ?? day.isCurrentMonth ?? false;
                        const isToday = day.date === todayStr;
                        const hasHours = day.hours > 0;
                        const isWeekend = day.is_weekend ?? day.isWeekend ?? false;
                        const isHovered = hoveredDayDate === day.date;

                        return (
                          <td
                            key={day.date}
                            onMouseEnter={() => setHoveredDayDate(day.date)}
                            onMouseLeave={() => setHoveredDayDate(null)}
                            className={`p-2 ws-sm:p-2.5 align-top border-r border-slate-100 dark:border-white/[0.07] relative min-h-19 transition-colors ${
                              !isCurrent
                                ? "bg-slate-50/40 dark:bg-black/30"
                                : isToday
                                ? "bg-[#c29b62]/[0.06] dark:bg-[#c29b62]/[0.18]"
                                : isWeekend
                                ? "bg-slate-50/25 dark:bg-black/15"
                                : "bg-transparent"
                            }`}
                          >
                            <div className="flex flex-col items-center justify-between min-h-16 gap-2">
                              {/* Day Number Header */}
                              <div className="w-full flex items-center justify-between">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-ui transition-all ${
                                    isToday
                                      ? "bg-gradient-to-br from-[#c29b62] to-[#9e7638] text-white ring-2 ring-[#c29b62]/30 font-bold shadow-xs"
                                      : !isCurrent
                                      ? "text-slate-300 dark:text-slate-600 font-medium"
                                      : "text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-white/10 font-bold"
                                  }`}
                                >
                                  {day.day_number ?? day.dayNumber}
                                </span>

                                {isToday && (
                                  <span className="type-overline text-[#9e7638] dark:text-[#d4af7a] bg-[#c29b62]/10 dark:bg-[#c29b62]/20 px-1.5 py-0.5 rounded-md">
                                    {t("Today", "Dnes", "Ma")}
                                  </span>
                                )}
                              </div>

                              {/* Worked Hours Pill (CCRM emerald badge) */}
                              {hasHours ? (
                                <div className="w-full flex items-center justify-center">
                                  <span
                                    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-caption font-bold font-mono transition-transform duration-150 ${
                                      isHovered ? "scale-105" : ""
                                    } ${
                                      isCurrent
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/90 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 shadow-xs"
                                        : "bg-slate-100/70 text-slate-400 dark:bg-white/5 dark:text-slate-500 border border-slate-200/50 dark:border-white/10"
                                    }`}
                                  >
                                    {formatDurationHoursMinutes(day.hours)}
                                  </span>
                                </div>
                              ) : (
                                <div className="h-5" />
                              )}
                            </div>

                            {/* Floating Day Project Breakdown Tooltip */}
                            {isHovered && day.projects && Object.keys(day.projects).length > 0 && (
                              <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-2xl bg-slate-900/95 dark:bg-[#0d1117] text-white text-caption shadow-2xl border border-slate-700/80 dark:border-white/10 backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                                <div className="font-bold text-[#d4af7a] mb-1.5 border-b border-slate-800 dark:border-white/10 pb-1.5 flex justify-between">
                                  <span>{day.date}</span>
                                  <span className="font-mono text-emerald-400 font-bold">
                                    {formatDurationHoursMinutes(day.hours)}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {Object.entries(day.projects).map(([pName, pHours]) => (
                                    <div key={pName} className="flex justify-between items-center text-micro">
                                      <span className="truncate max-w-31.25 text-slate-300">{pName}</span>
                                      <span className="font-mono text-emerald-400 font-bold">
                                        {formatDurationHoursMinutes(pHours)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* 8th Column: WEEK TOTAL */}
                      <td className="p-3 text-center align-middle bg-slate-50/50 dark:bg-black/20 border-l border-slate-200/80 dark:border-white/10">
                        <div className="flex flex-col items-center justify-center space-y-0.5">
                          <span className="text-body font-bold font-mono text-slate-900 dark:text-white tracking-tight">
                            {formatDurationHoursMinutes(weekHours)}
                          </span>
                          <span className="text-caption font-bold text-[#9e7638] dark:text-[#d4af7a]">
                            {formatNumber(weekActiveDays, systemLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{" "}
                            {t("days", "dní", "nap")}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer: MONTHLY TOTAL WORKED TIME (CCRM executive table footer) */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-white/10 bg-slate-100/90 dark:bg-black/40 text-slate-800 dark:text-slate-100">
                  <td
                    colSpan={7}
                    className="py-4 px-6 text-right font-extrabold text-ui text-slate-700 dark:text-slate-300"
                  >
                    <div className="flex items-center justify-end gap-2">
                      <Clock className="w-4 h-4 text-[#9e7638] dark:text-[#d4af7a]" />
                      <span>{t("MONTHLY TOTAL WORKED TIME:", "CELKOVÝ ODPRACOVANÝ ČAS:", "HAVI ÖSSZES LEDOLGOZOTT IDŐ:")}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center bg-[#c29b62]/10 dark:bg-[#c29b62]/20 border-l border-slate-200 dark:border-white/10">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-title-sm font-bold font-mono text-[#9e7638] dark:text-[#d4af7a] tracking-tight">
                        {formatDurationHoursMinutes(hoursData?.totalHours || 0)}
                      </span>
                      <span className="text-ui font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                        {formatNumber(activeDaysCount, systemLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{" "}
                        {t("Days", "Dní", "Nap")}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 4. VIEW 2: WEEKLY BREAKDOWN CARDS */}
      {viewMode === "weekly" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 ws-md:grid-cols-2 ws-lg:grid-cols-3 gap-4">
            {calendarWeeks.map((week) => {
              const weekHours = week.total_hours ?? week.hours ?? 0;
              const totalMonth = hoursData?.totalHours || 1;
              const pct = totalMonth > 0 ? (weekHours / totalMonth) * 100 : 0;
              const activeCount = week.days.filter((d) => d.hours > 0).length;
              const maxDayHours = Math.max(...week.days.map((d) => d.hours), 8);

              return (
                <div
                  key={week.week_number}
                  className="p-5 glass-panel rounded-3xl border border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95 shadow-glass flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div>
                      <span className="text-ui font-bold text-purple-600 dark:text-purple-400 block">
                        {t("Week", "Týždeň", "Hét")} {week.week_number}
                      </span>
                      <span className="text-caption text-slate-500 dark:text-slate-400">
                        {week.start_date.slice(5)} – {week.end_date.slice(5)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-title font-bold font-mono text-slate-900 dark:text-white block">
                        {formatDurationHoursMinutes(weekHours)}
                      </span>
                      <span className="text-micro text-slate-500 font-semibold">
                        {activeCount} {t("active days", "aktívnych dní", "aktív nap")} ({formatNumber(pct, systemLanguage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%)
                      </span>
                    </div>
                  </div>

                  {/* 7-day mini bar chart */}
                  <div className="space-y-1.5">
                    <span className="type-overline text-slate-500 block">
                      {t("Daily Distribution", "Rozdelenie po dňoch", "Napi eloszlás")}
                    </span>
                    <div className="grid grid-cols-7 gap-1.5 items-end h-16 pt-2">
                      {week.days.map((day) => {
                        const hPct = maxDayHours > 0 ? (day.hours / maxDayHours) * 100 : 0;
                        const isCur = day.is_current_month ?? day.isCurrentMonth ?? false;

                        return (
                          <div key={day.date} className="flex flex-col items-center h-full justify-end group relative">
                            {/* Hover tooltip */}
                            {day.hours > 0 && (
                              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 text-white text-micro font-mono px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-10">
                                {formatDurationHoursMinutes(day.hours)}
                              </div>
                            )}
                            <div className="w-full bg-slate-100 dark:bg-slate-800/80 rounded-t-sm h-12 flex items-end overflow-hidden">
                              <div
                                className={`w-full rounded-t-sm transition-all duration-300 ${
                                  day.hours > 0
                                    ? isCur
                                      ? "bg-emerald-500 dark:bg-emerald-400"
                                      : "bg-slate-400 dark:bg-slate-600"
                                    : "bg-transparent"
                                }`}
                                style={{ height: `${Math.max(day.hours > 0 ? 12 : 0, hPct)}%` }}
                              />
                            </div>
                            <span className="text-micro font-semibold text-slate-500 dark:text-slate-400 mt-1">
                              {day.weekday[0]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Progress bar of month total */}
                  <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex justify-between text-micro text-slate-500 font-semibold">
                      <span>{t("Share of Monthly Total", "Podiel na mesiaci", "Havi részesedés")}</span>
                      <span>{formatNumber(pct, systemLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 dark:bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. VIEW 3: CHRONOLOGICAL DAILY LOG TABLE */}
      {viewMode === "daily" && (
        <div className="glass-panel rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 shadow-glass overflow-hidden space-y-4 p-5">
          {/* Daily Table Filters */}
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h4 className="text-ui font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t("Daily Hours Log", "Denný záznam odpracovaných hodín", "Napi óranapló")}</span>
            </h4>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-ui">
              <button
                onClick={() => setDailyFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  dailyFilter === "all"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {t("All Days", "Všetky dni", "Összes nap")} ({dailyLog.length})
              </button>
              <button
                onClick={() => setDailyFilter("worked")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  dailyFilter === "worked"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {t("Worked Only", "Iba odpracované", "Csak ledolgozott")} ({activeDaysCount})
              </button>
              <button
                onClick={() => setDailyFilter("weekdays")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  dailyFilter === "weekdays"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {t("Weekdays Only", "Iba pracovné dni", "Csak munkanapok")}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 type-overline text-slate-500">
                  <th className="py-2.5 px-3">{t("Date", "Dátum", "Dátum")}</th>
                  <th className="py-2.5 px-3">{t("Weekday", "Deň", "Nap")}</th>
                  <th className="py-2.5 px-3">{t("Status", "Stav", "Állapot")}</th>
                  <th className="py-2.5 px-3 text-right">{t("Hours Worked", "Odpracované", "Ledolgozva")}</th>
                  <th className="py-2.5 px-3 text-right">{t("8h Days", "8h Dni", "8h Napok")}</th>
                  <th className="py-2.5 px-3">{t("Projects & Tasks", "Projekty a úlohy", "Projektek & Feladatok")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-ui">
                {filteredDailyLog.map((day) => {
                  const isWknd = day.is_weekend ?? day.isWeekend;
                  const isWorked = day.hours > 0;

                  return (
                    <tr
                      key={day.date}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors ${
                        day.date === todayStr ? "bg-[#c29b62]/[0.05] dark:bg-[#c29b62]/[0.10]" : ""
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {day.date}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-semibold whitespace-nowrap">
                        {day.weekday}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isWorked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            {t("Worked", "Odpracované", "Ledolgozva")}
                          </span>
                        ) : isWknd ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {t("Weekend", "Víkend", "Hétvége")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                            {t("Off", "Voľno", "Pihenő")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                        {isWorked ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 font-bold">
                            {formatDurationHoursMinutes(day.hours)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 font-normal">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                        {isWorked ? `${formatNumber(day.hours / 8, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} d` : "—"}
                      </td>
                      <td className="py-3 px-3">
                        {day.projects && Object.keys(day.projects).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(day.projects).map(([pName, pHours]) => (
                              <span
                                key={pName}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-micro font-medium border border-slate-200/50 dark:border-slate-700/50"
                              >
                                <span className="font-semibold">{pName}:</span>
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                  {formatDurationHoursMinutes(pHours)}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 text-caption">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. VIEW 4: MONTHLY SUMMARY & PROJECTS BREAKDOWN */}
      {viewMode === "projects" && (
        <div className="space-y-6">
          {/* Projects Breakdown Card */}
          <div className="p-6 glass-panel rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 shadow-glass space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-ui font-bold text-[#b58b4c] dark:text-[#d4af7a] flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                <span>{t("Projects Breakdown", "Rozdelenie hodín podľa projektov", "Projektek szerinti megoszlás")}</span>
              </h4>
              <span className="text-ui font-mono text-slate-500">
                {Object.keys(hoursData?.projects || {}).length} {t("projects", "projektov", "projekt")}
              </span>
            </div>

            {hoursData?.projects && Object.keys(hoursData.projects).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(hoursData.projects).map(([projName, pHours], idx) => {
                  const total = hoursData.totalHours > 0 ? hoursData.totalHours : 1;
                  const pct = (pHours / total) * 100;
                  const paletteColors = [
                    "bg-[#c29b62]",
                    "bg-emerald-500",
                    "bg-blue-500",
                    "bg-purple-500",
                    "bg-rose-500",
                    "bg-indigo-500",
                    "bg-teal-500",
                  ];
                  const barColor = paletteColors[idx % paletteColors.length];

                  return (
                    <div key={projName} className="space-y-1.5 p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800/50">
                      <div className="flex items-center justify-between text-ui">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full ${barColor} shrink-0`} />
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {projName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatDurationHoursMinutes(pHours)}
                          </span>
                          <span className="font-mono text-slate-500 text-caption min-w-11.25 text-right">
                            {formatNumber(pct, systemLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200/60 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-ui text-slate-400 text-center py-6">
                {t("No project data recorded.", "Žiadne projektové dáta.", "Nincsenek projektadatok.")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
