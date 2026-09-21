import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Coins, TrendingUp, TrendingDown,
  Plus, Search, Calendar, Layers, CheckCircle2,
  Clock, RefreshCw,
  Trash2,
  User, Briefcase, BarChart3,
  X, Globe,
  ChevronDown, ChevronUp, ChevronRight,
  CalendarClock, Hourglass, Telescope,
  Landmark, Check, Pencil,
  CalendarDays, Target, Maximize2, Minimize2,
  ArrowUpRight, ArrowDownRight, ArrowUpDown,
  SlidersHorizontal,
  Copy, Sparkles, GripVertical, UserPlus
} from "lucide-react";
import type {
  FinancialRecord,
  FinancialCategory,
  FinancialType,
  FinancialStatus,
  FinancialRecurringFrequency,
  Project,
  Lead,
  UserProfile
} from "../types";
import { CustomSelect, DropdownSearchRow } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { useQuickAddClient } from "./ui/QuickAddClient";
import { ColorPicker } from "./ui/ColorPicker";
import { inheritedColor, nextCategoryColor } from "../utils/color";
import type { Language } from "../utils/translations";
import { formatMoney } from "../utils/currency";
import { todayLocal, formatDateLocalized } from "../utils/localTime";
import {
  categoryBreadcrumbs,
  categoryChildren,
  categoryDescendantIds,
  moveCategory,
  nextCategorySortOrder,
  resolveCategoryDrop,
  type CategoryDropPosition,
  type CategoryDropTarget
} from "../utils/financialCategoryTree";
import { useDragAutoScroll } from "../hooks/useDragAutoScroll";
import { FULL_MODULE_ACCESS, type ModuleAccess } from "../utils/permissions";
import { useUserPref } from "../utils/userPrefs";
import {
  DEFAULT_BANK_BALANCE,
  EMPTY_FINANCIAL_TREND,
  type FinancialTrendSettings
} from "../utils/financialTrend";
import {
  effectiveRecurringEndDate,
  isoDaysBetween,
  lastRecurringOccurrenceOnOrBefore,
  nextRecurringChargeAfter,
  pauseRecurringRule,
  recurringAmountHistoryAfterChange,
  recurringChargeAmount,
  recurringEarliestRepriceDate,
  recurringCharges,
  recurringOccurrences,
  recurringPlannedAmountAt,
  recurringTotalInRange,
  shiftIsoDate,
  skipRecurringDate,
  toggleRecurringPause,
  unskipRecurringDate,
  type RecurringRule
} from "../utils/recurringExpenses";
import {
  UNCATEGORIZED_ROW_ID,
  aggregateOverviewTable,
  isRecurringChargeSettled,
  overviewRecordDate,
  recurringOwnRowCharge,
  splitRecordAmounts
} from "../utils/financialOverviewTable";
import {
  claimedRecordIds,
  futureTotals,
  futureWindow,
  hasFutureBeyond,
  projectFutureMovements,
  type FutureMovement,
  type FutureMovementSource
} from "../utils/futureMovements";
import {
  ledgerRecordSplit,
  projectPastRecurringCharges,
  type PastRecurringCharge
} from "../utils/pastRecurringCharges";

// Trend graph forecast horizons. `futureWeeks` is the number of whole weeks the
// projection runs past the current one — 13 weeks is the usual "3 months".
type ProjectionMonths = 3 | 6 | 12;

const PROJECTION_HORIZONS: { months: ProjectionMonths; futureWeeks: number }[] = [
  { months: 3, futureWeeks: 13 },
  { months: 6, futureWeeks: 26 },
  { months: 12, futureWeeks: 52 }
];

const TREND_PAST_WEEKS = 4;

const futureWeeksFor = (months: ProjectionMonths) =>
  PROJECTION_HORIZONS.find((h) => h.months === months)?.futureWeeks ?? 13;

// Slovak numerals agree with their noun: 2-4 take the nominative plural
// ("3 mesiace"), 5 and up the genitive ("6 mesiacov").
const skMonths = (n: number) => (n < 5 ? `${n} mesiace` : `${n} mesiacov`);
const skNextMonths = (n: number) =>
  n < 5 ? `nasledujúce ${n} mesiace` : `nasledujúcich ${n} mesiacov`;

// Payment statuses offered by the inline picker in the movements ledger, in the
// order a record usually travels through them.
const MOVEMENT_STATUSES: FinancialStatus[] = [
  "planned",
  "pending",
  "paid",
  "partially_paid",
  "overdue",
  "cancelled"
];

const MOVEMENT_STATUS_DOT: Record<FinancialStatus, string> = {
  planned: "bg-slate-400",
  pending: "bg-amber-500",
  paid: "bg-emerald-500",
  partially_paid: "bg-sky-500",
  overdue: "bg-rose-500",
  cancelled: "bg-slate-300"
};

/**
 * The forecast overlay in the movements ledger.
 *
 * A forecast row is money that has not moved: it has no record behind it, it
 * cannot be edited or deleted, and it must never read as something that
 * happened. Violet is the app's "projected" colour — the cash-flow chart
 * already plots its forecast in it — and the dashed left rail plus the tinted,
 * lighter amount carry that through to the row.
 */
const FORECAST_ROW_CLASS =
  "bg-violet-50/70 hover:bg-violet-100/70 border-l-[3px] border-dashed border-l-violet-400 transition-colors group";

/**
 * A charge a recurring rule has already made. It is settled money, so it reads
 * like any other movement; the solid purple rail (the recurring icon's colour)
 * marks it as drawn from the rule's schedule rather than stored on its own,
 * the settled counterpart of the forecast's dashed violet one.
 */
const RECURRING_CHARGE_ROW_CLASS =
  "hover:bg-slate-50/80 border-l-[3px] border-l-purple-300 transition-colors group";

/** What each forecast row is derived from, for its badge. */
const FORECAST_SOURCE_ICON: Record<FutureMovementSource, typeof RefreshCw> = {
  recurring: RefreshCw,
  due: CalendarClock,
  scheduled: Hourglass
};

/**
 * One line of the movements ledger: a stored movement, a charge a recurring
 * rule has already made, or a movement that is only expected. All three are
 * filed under a `date` so they can be merged into a single chronology and
 * grouped by month together.
 */
type MovementLedgerRow =
  | { kind: "record"; key: string; date: string; record: FinancialRecord }
  | { kind: "charge"; key: string; date: string; charge: PastRecurringCharge }
  | { kind: "forecast"; key: string; date: string; forecast: FutureMovement };

/**
 * Money only really moved for these two, so switching a row into them has to ask
 * for the amount that was actually settled instead of guessing it.
 */
const statusNeedsRealAmount = (status: FinancialStatus): status is "paid" | "partially_paid" =>
  status === "paid" || status === "partially_paid";

/**
 * Which bucket a movement's own scope falls into, computed once from the
 * record itself. A project-scoped record also carries the project's
 * `clientId` (see `handleSaveTransaction`), so checking `clientId` alone
 * would also catch project records under "Client" — project takes priority.
 */
const movementScope = (rec: Pick<FinancialRecord, "projectId" | "clientId">): "global" | "project" | "client" =>
  rec.projectId ? "project" : rec.clientId ? "client" : "global";

/** Shared look of the transaction form: one label style, one 40px field style. */
const FORM_LABEL = "text-xs font-semibold text-slate-600 block mb-1.5";
const FORM_INPUT =
  "w-full h-10 px-3.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 hover:border-slate-300 transition-colors duration-150 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
const FORM_TEXTAREA =
  "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 hover:border-slate-300 transition-colors duration-150 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-y";

interface SearchableCategorySelectProps {
  value: string;
  onChange: (catId: string) => void;
  categories: FinancialCategory[];
  filterType?: FinancialType | "all";
  allowAll?: boolean;
  placeholder?: string;
  /** "md" matches the 40px fields of the transaction form; "sm" is the compact filter-bar trigger. */
  size?: "sm" | "md";
  t: (en: string, sk: string, hu: string) => string;
}

const SearchableCategorySelect: React.FC<SearchableCategorySelectProps> = ({
  value,
  onChange,
  categories,
  filterType = "all",
  allowAll = true,
  placeholder,
  size = "sm",
  t
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  const selectedCategory = categories.find((c) => c.id === value);

  // Build full hierarchy breadcrumb for search and display — guarded against a
  // cyclic parentId chain, which would otherwise loop forever (see F14).
  const getCategoryPath = (cat: FinancialCategory): string =>
    categoryBreadcrumbs(categories, cat.id)
      .map((c) => c.name)
      .join(" ➔ ");

  const filteredCategories = useMemo(() => {
    return categories
      .filter((c) => filterType === "all" || c.type === filterType)
      .filter((c) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        const fullPath = getCategoryPath(c).toLowerCase();
        return fullPath.includes(q);
      });
  }, [categories, filterType, search]);

  const expenseCategories = filteredCategories.filter((c) => c.type === "expense");
  const incomeCategories = filteredCategories.filter((c) => c.type === "income");

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${size === "md" ? "h-10 px-3.5 bg-white" : "py-1.5 px-3 bg-slate-50"} border border-slate-200 hover:border-emerald-500 rounded-xl text-xs text-left flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {selectedCategory ? (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: inheritedColor(categories, selectedCategory.id) || (selectedCategory.type === "income" ? "#10b981" : "#f43f5e") }}
              />
              <span className="font-semibold text-slate-800  truncate">
                {getCategoryPath(selectedCategory)}
              </span>
              <span
                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
                  selectedCategory.type === "income"
                    ? "bg-emerald-100  text-emerald-700 "
                    : "bg-rose-100  text-rose-700 "
                }`}
              >
                {selectedCategory.type === "income" ? t("Income", "Príjem", "Bevétel") : t("Expense", "Výdavok", "Kiadás")}
              </span>
            </>
          ) : (
            <span className="text-slate-600  font-medium truncate">
              {placeholder || (allowAll ? t("All Categories", "Všetky kategórie", "Minden kategória") : t("-- Select Category --", "-- Vyberte kategóriu --", "-- Válasszon kategóriát --"))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {selectedCategory && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(allowAll ? "all" : "");
              }}
              className="p-0.5 hover:text-slate-600  rounded-md"
              title={t("Clear selection", "Zrušiť výber", "Törlés")}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180 text-emerald-500" : ""}`} />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-[100] bg-white  border border-slate-200  rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col min-w-[280px]">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100  flex items-center gap-2 bg-slate-50/70 ">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search categories...", "Hľadať kategórie...", "Keresés a kategóriákban...")}
              className="w-full bg-transparent text-xs text-slate-800  placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="p-1 text-slate-400 hover:text-slate-600 "
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* List Options */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
            {allowAll && (
              <button
                type="button"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  value === "all" || !value
                    ? "bg-emerald-50  text-emerald-700  font-bold"
                    : "text-slate-700  hover:bg-slate-100 "
                }`}
              >
                <span>{t("All Categories", "Všetky kategórie", "Minden kategória")}</span>
                {(value === "all" || !value) && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            )}

            {/* Expense Categories Group */}
            {expenseCategories.length > 0 && (
              <div className="pt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                  <TrendingDown className="h-3 w-3" />
                  <span>{t("Expenses", "Výdavky", "Kiadások")}</span>
                </div>
                {expenseCategories.map((c) => {
                  const isSelected = value === c.id;
                  const indent = c.level === 1 ? "" : c.level === 2 ? "pl-5" : "pl-8";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${indent} ${
                        isSelected
                          ? "bg-rose-50  text-rose-700  font-bold"
                          : "text-slate-700  hover:bg-slate-100 "
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: inheritedColor(categories, c.id) || "#f43f5e" }}
                        />
                        <span className={c.level === 1 ? "font-bold text-slate-900 " : "font-normal"}>
                          {c.level === 1 ? c.name : c.level === 2 ? `↳ ${c.name}` : `↳↳ ${c.name}`}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Income Categories Group */}
            {incomeCategories.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100  mt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  <span>{t("Incomes", "Príjmy", "Bevételek")}</span>
                </div>
                {incomeCategories.map((c) => {
                  const isSelected = value === c.id;
                  const indent = c.level === 1 ? "" : c.level === 2 ? "pl-5" : "pl-8";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${indent} ${
                        isSelected
                          ? "bg-emerald-50  text-emerald-700  font-bold"
                          : "text-slate-700  hover:bg-slate-100 "
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: inheritedColor(categories, c.id) || "#10b981" }}
                        />
                        <span className={c.level === 1 ? "font-bold text-slate-900 " : "font-normal"}>
                          {c.level === 1 ? c.name : c.level === 2 ? `↳ ${c.name}` : `↳↳ ${c.name}`}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredCategories.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                {t("No categories found", "Nenašli sa žiadne kategórie", "Nem található kategória")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SearchableScopeSelectProps {
  value: string; // e.g. "all", "global", "project:xxx", "client:yyy"
  onChange: (val: string) => void;
  projects: Project[];
  leads: Lead[];
  allowAll?: boolean;
  allowGlobal?: boolean;
  placeholder?: string;
  t: (en: string, sk: string, hu: string) => string;
}

const SearchableScopeSelect: React.FC<SearchableScopeSelectProps> = ({
  value,
  onChange,
  projects,
  leads,
  allowAll = true,
  allowGlobal = true,
  placeholder,
  t
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const quickAdd = useQuickAddClient();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  // Determine current label and icon
  const selectedInfo = useMemo(() => {
    if (value === "all" || !value) {
      return {
        label: placeholder || (allowAll ? t("All Entity Scopes", "Všetky prepojenia", "Minden hatókör") : t("-- Select Link --", "-- Vyberte prepojenie --", "-- Válasszon --")),
        type: "all"
      };
    }
    if (value === "global") {
      return {
        label: t("Global Company-Wide Only", "Globálne firemné", "Vállalati szintű"),
        type: "global"
      };
    }
    if (value.startsWith("project:")) {
      const pid = value.replace("project:", "");
      if (pid === "all") return { label: t("All Projects", "Všetky projekty", "Minden projekt"), type: "project" };
      const p = projects.find((proj) => proj.id === pid);
      const lead = leads.find((l) => l.id === p?.leadId || l.id === p?.clientId);
      return {
        label: lead ? `${lead.name} (${p?.id.slice(0, 8)})` : `Projekt ${pid.slice(0, 8)}`,
        subtext: lead?.city || "",
        type: "project"
      };
    }
    if (value.startsWith("client:")) {
      const cid = value.replace("client:", "");
      if (cid === "all") return { label: t("All Clients", "Všetci klienti", "Minden ügyfél"), type: "client" };
      const l = leads.find((lead) => lead.id === cid);
      return {
        label: l ? l.name : cid,
        subtext: l?.city || l?.phone || "",
        type: "client"
      };
    }
    return { label: value, type: "other" };
  }, [value, projects, leads, allowAll, placeholder, t]);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const lead = leads.find((l) => l.id === p.leadId || l.id === p.clientId);
      const matchName = (lead?.name || "").toLowerCase().includes(q);
      const matchCity = (lead?.city || "").toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      return matchName || matchCity || matchId;
    });
  }, [projects, leads, search]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      const matchName = l.name.toLowerCase().includes(q);
      const matchCity = (l.city || "").toLowerCase().includes(q);
      const matchPhone = (l.phone || "").toLowerCase().includes(q);
      const matchEmail = (l.email || "").toLowerCase().includes(q);
      return matchName || matchCity || matchPhone || matchEmail;
    });
  }, [leads, search]);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-1.5 px-3 bg-slate-50  border border-slate-200  hover:border-emerald-500 rounded-xl text-xs text-left flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {selectedInfo.type === "global" ? (
            <Globe className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          ) : selectedInfo.type === "project" ? (
            <Briefcase className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          ) : selectedInfo.type === "client" ? (
            <User className="h-3.5 w-3.5 text-teal-500 shrink-0" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
          <span className="font-semibold text-slate-800  truncate">
            {selectedInfo.label}
          </span>
          {selectedInfo.subtext && (
            <span className="text-[10px] text-slate-400 shrink-0 font-normal">
              ({selectedInfo.subtext})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && value !== "all" && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(allowAll ? "all" : "");
              }}
              className="p-0.5 hover:text-slate-600  rounded-md"
              title={t("Clear selection", "Zrušiť výber", "Törlés")}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180 text-emerald-500" : ""}`} />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-[100] bg-white  border border-slate-200  rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col min-w-[300px]">
          {/* Search Header */}
          <DropdownSearchRow
            inputRef={inputRef}
            value={search}
            onChange={setSearch}
            placeholder={t("Search projects or clients...", "Hľadať projekty alebo klientov...", "Keresés projekt vagy ügyfél szerint...")}
            addNewIcon={<UserPlus className="h-4 w-4" />}
            addNewLabel={t("Add a new client", "Pridať nového klienta", "Új ügyfél hozzáadása")}
            onAddNew={
              quickAdd.enabled
                ? () => {
                    setIsOpen(false);
                    quickAdd.open((lead) => onChange(`client:${lead.id}`));
                  }
                : undefined
            }
          />

          {/* List Options */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
            {allowAll && (
              <button
                type="button"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  value === "all" || !value
                    ? "bg-emerald-50  text-emerald-700  font-bold"
                    : "text-slate-700  hover:bg-slate-100 "
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t("All Entity Scopes", "Všetky prepojenia", "Minden hatókör")}</span>
                </div>
                {(value === "all" || !value) && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            )}

            {allowGlobal && (
              <button
                type="button"
                onClick={() => {
                  onChange("global");
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  value === "global"
                    ? "bg-emerald-50  text-emerald-700  font-bold"
                    : "text-slate-700  hover:bg-slate-100 "
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-slate-500" />
                  <span>{t("Global Company-Wide Only", "Globálne firemné", "Vállalati szintű")}</span>
                </div>
                {value === "global" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            )}

            {/* Projects Group */}
            {filteredProjects.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100  mt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" />
                  <span>{t("Projects", "Projekty", "Projektek")}</span>
                </div>
                {filteredProjects.map((p) => {
                  const lead = leads.find((l) => l.id === p.leadId || l.id === p.clientId);
                  const isSelected = value === `project:${p.id}`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onChange(`project:${p.id}`);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-indigo-50  text-indigo-700  font-bold"
                          : "text-slate-700  hover:bg-slate-100 "
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        <span className="font-semibold text-slate-800  truncate">
                          {lead ? lead.name : `Projekt ${p.id.slice(0, 8)}`}
                        </span>
                        {lead?.city && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            • {lead.city}
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-100  px-1 rounded">
                          #{p.id.slice(0, 6)}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Clients Group */}
            {filteredLeads.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100  mt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-500 flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  <span>{t("Clients", "Klienti", "Ügyfelek")}</span>
                </div>
                {filteredLeads.map((l) => {
                  const isSelected = value === `client:${l.id}`;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        onChange(`client:${l.id}`);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-teal-50  text-teal-700  font-bold"
                          : "text-slate-700  hover:bg-slate-100 "
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                        <span className="font-semibold text-slate-800  truncate">
                          {l.name}
                        </span>
                        {l.city && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            • {l.city}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredProjects.length === 0 && filteredLeads.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                {t("No projects or clients found", "Nenašli sa žiadne projekty ani klienti", "Nem található projekt vagy ügyfél")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FinancialManagementViewProps {
  financialRecords: FinancialRecord[];
  setFinancialRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  financialCategories: FinancialCategory[];
  setFinancialCategories: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  /**
   * Manual weekly bank-balance anchors for the trend chart. Shared workspace
   * data, not a per-browser setting — see utils/financialTrend.ts.
   */
  financialTrend?: FinancialTrendSettings;
  setFinancialTrend?: (next: FinancialTrendSettings) => void;
  projects: Project[];
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  currencyCode?: string | null;
  onOpenProject?: (projectId: string) => void;
  onOpenClient?: (clientId: string) => void;
  /** Role access for the financial module. `edit: false` renders the view read-only. */
  access?: ModuleAccess;
}

export const FinancialManagementView: React.FC<FinancialManagementViewProps> = ({
  financialRecords = [],
  setFinancialRecords: setFinancialRecordsRaw,
  financialCategories = [],
  setFinancialCategories: setFinancialCategoriesRaw,
  financialTrend = EMPTY_FINANCIAL_TREND,
  setFinancialTrend,
  projects = [],
  leads = [],
  userLanguage,
  currencyCode,
  onOpenProject,
  onOpenClient,
  access = FULL_MODULE_ACCESS
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;
  const canEdit = access.edit;
  const canDelete = access.delete;
  const setFinancialRecords: typeof setFinancialRecordsRaw = (updater) => {
    if (!canEdit) return;
    setFinancialRecordsRaw(updater);
  };
  const setFinancialCategories: typeof setFinancialCategoriesRaw = (updater) => {
    if (!canEdit) return;
    setFinancialCategoriesRaw(updater);
  };

  const money = (v: number) => formatMoney(v, currencyCode, userLanguage);

  const movementStatusLabel = (status: FinancialStatus) => {
    switch (status) {
      case "planned": return t("Planned", "Plánované", "Tervezett");
      case "pending": return t("Pending", "Čaká na úhradu", "Fizetésre vár");
      case "paid": return t("Paid", "Uhradené", "Fizetve");
      case "partially_paid": return t("Partially Paid", "Čiastočne uhradené", "Részben fizetve");
      case "overdue": return t("Overdue", "Po splatnosti", "Lejárt");
      case "cancelled": return t("Cancelled", "Zrušené", "Törölve");
      default: return status;
    }
  };

  const movementStatusBadgeClass = (status: FinancialStatus) =>
    status === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "partially_paid"
        ? "bg-sky-50 text-sky-700 border-sky-200"
        : status === "pending"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : status === "overdue"
            ? "bg-rose-50 text-rose-700 border-rose-200"
            : "bg-slate-100 text-slate-600 border-slate-200";

  const movementStatusOptions = useMemo(
    () =>
      MOVEMENT_STATUSES.map((s) => ({
        value: s,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${MOVEMENT_STATUS_DOT[s]}`} />
            <span>{movementStatusLabel(s)}</span>
          </span>
        ),
        searchText: movementStatusLabel(s)
      })),
    [userLanguage]
  );

  // Helper to parse subtab & query parameters from URL hash
  const parseFinancialUrlState = () => {
    const raw = window.location.hash.replace("#", "");
    const [pathPart, queryPart] = raw.split("?");
    const parts = (pathPart || "").split("/");
    const sub = (parts[1] || parts[0] || "").toLowerCase();

    let tab: "overview" | "table" | "movements" | "recurring" | "categories" = "overview";
    if (sub === "table" || sub === "tabulka" || sub === "matrix" || sub === "overview-table" || sub === "prehlad") tab = "table";
    else if (sub === "movements" || sub === "pohyby" || sub === "transactions" || sub === "mozgasok" || sub === "incomes" || sub === "expenses") tab = "movements";
    else if (sub === "recurring" || sub === "pravidelne" || sub === "rendszeres") tab = "recurring";
    else if (sub === "categories" || sub === "kategorie" || sub === "kategoriak") tab = "categories";

    const params = new URLSearchParams(queryPart || "");
    return {
      tab,
      search: params.get("q") || "",
      scope: (params.get("scope") as "all" | "global" | "project" | "client") || "all",
      project: params.get("project") || "all",
      client: params.get("client") || "all",
      status: params.get("status") || "all",
      category: params.get("category") || "all",
    };
  };

  const initialUrlState = parseFinancialUrlState();

  // Main navigation tabs
  const [activeTab, setActiveTab] = useState<"overview" | "table" | "movements" | "recurring" | "categories">(initialUrlState.tab);

  // Overview Matrix Table State
  const [tableGranularity, setTableGranularity] = useState<"week" | "month" | "quarter" | "half" | "year">("month");
  const [tableYear, setTableYear] = useState<number>(new Date().getFullYear());
  const [tableValueMode, setTableValueMode] = useState<"both" | "real" | "estimated" | "total">("both");
  const [expandedCatIds, setExpandedCatIds] = useState<Set<string>>(() => new Set());
  const [tableSearchQuery, setTableSearchQuery] = useState("");

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // A search match must always be visible, even inside a branch nobody has
  // manually expanded — otherwise a level-3 hit renders under a still-collapsed
  // level-1 row and never reaches the screen (see F18).
  useEffect(() => {
    const q = tableSearchQuery.trim().toLowerCase();
    if (!q) return;
    const toExpand = new Set<string>();
    financialCategories.forEach((cat) => {
      if (cat.name.toLowerCase().includes(q)) {
        categoryBreadcrumbs(financialCategories, cat.id)
          .slice(0, -1)
          .forEach((ancestor) => toExpand.add(ancestor.id));
      }
    });
    if (toExpand.size === 0) return;
    setExpandedCatIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      toExpand.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tableSearchQuery, financialCategories]);

  // The Total/Net rows are deliberately never filtered by the category search
  // — they always add up to the true total — so this makes that explicit
  // instead of silently disagreeing with the (filtered) rows above them (see F18).
  const tableSearchTotalSuffix = tableSearchQuery.trim()
    ? t(" (of all categories)", " (za všetky kategórie)", " (minden kategóriára)")
    : "";



  const expandAllExpenseCategories = () => {
    const expenseCatIds = financialCategories.filter((c) => c.type === "expense").map((c) => c.id);
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      expenseCatIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const collapseAllExpenseCategories = () => {
    const expenseCatIds = new Set(financialCategories.filter((c) => c.type === "expense").map((c) => c.id));
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      expenseCatIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const expandAllIncomeCategories = () => {
    const incomeCatIds = financialCategories.filter((c) => c.type === "income").map((c) => c.id);
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      incomeCatIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const collapseAllIncomeCategories = () => {
    const incomeCatIds = new Set(financialCategories.filter((c) => c.type === "income").map((c) => c.id));
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      incomeCatIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const areAllExpensesExpanded = useMemo(() => {
    const expenseCatsWithChildren = financialCategories.filter(
      (c) => c.type === "expense" && financialCategories.some((sub) => sub.parentId === c.id)
    );
    if (expenseCatsWithChildren.length === 0) return false;
    return expenseCatsWithChildren.every((c) => expandedCatIds.has(c.id));
  }, [financialCategories, expandedCatIds]);

  const areAllIncomesExpanded = useMemo(() => {
    const incomeCatsWithChildren = financialCategories.filter(
      (c) => c.type === "income" && financialCategories.some((sub) => sub.parentId === c.id)
    );
    if (incomeCatsWithChildren.length === 0) return false;
    return incomeCatsWithChildren.every((c) => expandedCatIds.has(c.id));
  }, [financialCategories, expandedCatIds]);

  // Hash listener to handle browser back / forward / external deep links
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseFinancialUrlState();
      setActiveTab(parsed.tab);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Update hash when tab is switched
  const handleTabChange = (tabId: "overview" | "table" | "movements" | "recurring" | "categories") => {
    setActiveTab(tabId);
    window.location.hash = tabId === "overview" ? "financial/overview" : `financial/${tabId}`;
  };

  // Modal states for Create/Edit Transaction
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);

  /**
   * One charge of a recurring rule being edited on its own — opened from the
   * movements ledger, never from the Recurring tab. `existing` is the stored
   * movement already standing in for that day, when there is one; otherwise
   * the save creates it and lists `date` in the rule's `recurringSkippedDates`.
   * The rule itself (title, category, scope, schedule) is edited only on the
   * Recurring tab.
   */
  const [editingOccurrence, setEditingOccurrence] = useState<{
    rule: FinancialRecord;
    date: string;
    existing: FinancialRecord | null;
  } | null>(null);

  // Smoothly animated close handler
  const handleCloseModal = () => {
    setIsClosingModal(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosingModal(false);
      setEditingOccurrence(null);
    }, 280);
  };

  // Category Tree Manager Modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catTreeType, setCatTreeType] = useState<FinancialType>("expense");
  const [newCatName, setNewCatName] = useState("");
  const [newCatParentId, setNewCatParentId] = useState<string>("");
  const [newCatColor, setNewCatColor] = useState("");
  // Until a colour is picked on purpose, a subcategory inherits its parent's and
  // a main category gets the next colour no other main category of its type has.
  const [newCatColorTouched, setNewCatColorTouched] = useState(false);

  // Transaction Form fields
  const [formType, setFormType] = useState<FinancialType>("expense");
  const [formSubtype, setFormSubtype] = useState<string>("regular");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmountPlanned, setFormAmountPlanned] = useState<number | "">("");
  const [formAmountReal, setFormAmountReal] = useState<number | "">("");
  const [formStatus, setFormStatus] = useState<FinancialStatus>("planned");
  const [formIssueDate, setFormIssueDate] = useState(todayLocal());
  const [formDueDate, setFormDueDate] = useState("");
  const [formPaidDate, setFormPaidDate] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("bank_transfer");
  const [formScope, setFormScope] = useState<"global" | "project" | "client">("global");
  const [formProjectId, setFormProjectId] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
  const [formTaxRate, setFormTaxRate] = useState<number>(20);

  // Recurrence Form fields
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurringFreq, setFormRecurringFreq] = useState<FinancialRecurringFrequency>("monthly");
  const [formWeeklyDay, setFormWeeklyDay] = useState<number>(1); // Monday
  const [formMonthlyType, setFormMonthlyType] = useState<"day_of_month" | "nth_weekday">("day_of_month");
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formWeekOfMonth, setFormWeekOfMonth] = useState<number>(1); // 1 = 1st
  const [formNthDayOfWeek, setFormNthDayOfWeek] = useState<number>(1);
  const [formYearlyMonth, setFormYearlyMonth] = useState<number>(1);
  const [formRecurringStartDate, setFormRecurringStartDate] = useState(todayLocal());
  const [formRecurringEndDate, setFormRecurringEndDate] = useState("");
  // The real planned end a pause tucks away, restored on resume — see
  // `pauseRecurringRule`. Only ever written by the "Zrušené" status shortcut
  // below; the end-date field itself is untouched by it.
  const [formRecurringPlannedEndDate, setFormRecurringPlannedEndDate] = useState<string | null>(null);
  // The day a changed recurring amount takes effect; "" = from the next charge.
  const [formAmountAppliesFrom, setFormAmountAppliesFrom] = useState("");



  // ==========================================
  // 3. MOVEMENTS TAB STATE & DATA LOGIC (TAB 3)
  // ==========================================
  const [movementsSearch, setMovementsSearch] = useState(initialUrlState.search);
  const [movementsType, setMovementsType] = useState<"all" | "income" | "expense">("all");
  const [movementsCategoryId, setMovementsCategoryId] = useState<string>(initialUrlState.category !== "all" ? initialUrlState.category : "all");
  const [movementsScope, setMovementsScope] = useState<"all" | "global" | "project" | "client">(initialUrlState.scope);
  const [movementsProjectId, setMovementsProjectId] = useState<string>(initialUrlState.project);
  const [movementsClientId, setMovementsClientId] = useState<string>(initialUrlState.client);
  const [movementsMinAmount, setMovementsMinAmount] = useState<string>("");
  const [movementsMaxAmount, setMovementsMaxAmount] = useState<string>("");
  const [movementsDatePreset, setMovementsDatePreset] = useState<"all" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom">("all");
  const [movementsStartDate, setMovementsStartDate] = useState<string>("");
  const [movementsEndDate, setMovementsEndDate] = useState<string>("");
  const [movementsSortOrder, setMovementsSortOrder] = useState<"desc" | "asc">("desc");
  const [movementsVisibleCount, setMovementsVisibleCount] = useState<number>(40);
  // A filter seeded from the URL hash must not land hidden inside a collapsed
  // drawer — the user would see filtered results with no visible reason why.
  const [isMovementsAdvancedOpen, setIsMovementsAdvancedOpen] = useState<boolean>(
    initialUrlState.category !== "all" ||
      initialUrlState.scope !== "all" ||
      initialUrlState.project !== "all" ||
      initialUrlState.client !== "all"
  );

  // Forecast overlay: expected movements drawn into the ledger alongside the
  // real ones. A recurring rule charges forever, so the overlay only ever holds
  // a bounded window — one month to start with, widened a month per click.
  const [showFutureMovements, setShowFutureMovements] = useState<boolean>(false);
  const [futureHorizonMonths, setFutureHorizonMonths] = useState<number>(1);

  // Sentinel ref for infinite scroll
  const movementsSentinelRef = useRef<HTMLDivElement | null>(null);

  // Helper to get breadcrumbs for any category ID, guarded against a cyclic
  // `parentId` chain (see F14) by the shared, cycle-guarded walker.
  const getCategoryBreadcrumbs = (catId?: string | null): FinancialCategory[] =>
    catId ? categoryBreadcrumbs(financialCategories, catId) : [];

  // The day a real movement is filed under in the ledger — cash basis, the
  // same rule the trend and the overview table use (see F3), so a movement
  // cannot land in three different months across the three tabs.
  const movementLedgerDate = (rec: FinancialRecord): string => overviewRecordDate(rec);

  /**
   * Everything the filter bar asks of one ledger line, in one place.
   *
   * The real movements and the forecast overlay have to read the filters
   * identically, or a movement would drop out of one and not the other. What
   * differs between them is the date the line is filed under (the day it was
   * entered versus the day the money is expected) and the figure the value
   * range is measured against (the whole movement versus what is still
   * outstanding), so both arrive as arguments instead of being read off the
   * record.
   */
  const movementMatchesFilters = useMemo(() => {
    const query = movementsSearch.trim().toLowerCase();

    // A category filter matches the category itself and everything under it.
    // `categoryDescendantIds` is already guarded against a cyclic `parentId`
    // (see F14); it does not include the starting id itself, so it is added
    // back in here.
    let categoryIds: Set<string> | null = null;
    if (movementsCategoryId !== "all") {
      categoryIds = new Set<string>([
        movementsCategoryId,
        ...categoryDescendantIds(financialCategories, movementsCategoryId)
      ]);
    }

    // Every preset is a plain inclusive range once resolved; `-31` as an end is
    // safe because no date inside the month can sort past it.
    const now = new Date();
    const monthRange = (d: Date): { start: string; end: string } => {
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { start: `${ym}-01`, end: `${ym}-31` };
    };
    let range: { start: string | null; end: string | null } = { start: null, end: null };
    if (movementsDatePreset === "this_month") {
      range = monthRange(now);
    } else if (movementsDatePreset === "last_month") {
      // Anchored on the 1st: stepping the month on today's own date makes
      // "31 February" on 31 March, which JS normalises to 3 March, and the
      // preset would quietly show the current month instead of the previous one.
      range = monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    } else if (movementsDatePreset === "this_quarter") {
      const q = Math.floor(now.getMonth() / 3);
      const y = now.getFullYear();
      range = {
        start: `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`,
        end: `${y}-${String(q * 3 + 3).padStart(2, "0")}-31`
      };
    } else if (movementsDatePreset === "this_year") {
      const y = now.getFullYear();
      range = { start: `${y}-01-01`, end: `${y}-12-31` };
    } else if (movementsDatePreset === "custom") {
      range = { start: movementsStartDate || null, end: movementsEndDate || null };
    }

    const min = movementsMinAmount === "" ? null : parseFloat(movementsMinAmount);
    const max = movementsMaxAmount === "" ? null : parseFloat(movementsMaxAmount);

    return (rec: FinancialRecord, dateIso: string, amount: number): boolean => {
      // 1. Search Query
      if (query) {
        const project = projects.find((p) => p.id === rec.projectId);
        const projectLead = project ? leads.find((l) => l.id === project.clientId || l.id === project.leadId) : null;
        const projectTitle = project ? (projectLead ? `${projectLead.name} (${project.id.slice(0, 8)})` : `Projekt ${project.id.slice(0, 8)}`) : "";
        const client = leads.find((l) => l.id === rec.clientId || l.id === project?.clientId || l.id === project?.leadId);
        const catBreadcrumbs = getCategoryBreadcrumbs(rec.categoryId).map((c) => c.name).join(" ");
        const hit =
          rec.title.toLowerCase().includes(query) ||
          (!!rec.description && rec.description.toLowerCase().includes(query)) ||
          (!!rec.invoiceNumber && rec.invoiceNumber.toLowerCase().includes(query)) ||
          (!!catBreadcrumbs && catBreadcrumbs.toLowerCase().includes(query)) ||
          (!!projectTitle && projectTitle.toLowerCase().includes(query)) ||
          (!!client && client.name.toLowerCase().includes(query));
        if (!hit) return false;
      }

      // 2. Type Filter (income vs expense)
      if (movementsType !== "all" && rec.type !== movementsType) return false;

      // 3. Category Filter (match self or any descendants)
      if (categoryIds && !(rec.categoryId && categoryIds.has(rec.categoryId))) return false;

      // 4. Scope / Project / Client — scope is computed once (project takes
      // priority over client, see `movementScope`), so "Client" cannot also
      // list a project record just because it carries the project's clientId.
      if (movementsScope !== "all") {
        if (movementScope(rec) !== movementsScope) return false;
        if (movementsScope === "project" && movementsProjectId !== "all" && rec.projectId !== movementsProjectId) return false;
        if (movementsScope === "client" && movementsClientId !== "all" && rec.clientId !== movementsClientId) return false;
      }

      // 5. Value Range
      if (min !== null && !isNaN(min) && amount < min) return false;
      if (max !== null && !isNaN(max) && amount > max) return false;

      // 6. Date Range / Presets
      if (range.start !== null && dateIso < range.start) return false;
      if (range.end !== null && dateIso > range.end) return false;

      return true;
    };
  }, [
    movementsSearch,
    movementsType,
    movementsCategoryId,
    movementsScope,
    movementsProjectId,
    movementsClientId,
    movementsMinAmount,
    movementsMaxAmount,
    movementsDatePreset,
    movementsStartDate,
    movementsEndDate,
    financialCategories,
    projects,
    leads
  ]);

  // Movements Filter Hook
  const filteredMovements = useMemo(() => {
    const list = financialRecords.filter((rec) => {
      // The value range is measured against the record's whole value (real +
      // estimated), the same figure `splitRecordAmounts` gives every other
      // reader, not an ad hoc "real if any, else planned" guess (see F4).
      const { real, estimated } = splitRecordAmounts(rec);
      return movementMatchesFilters(rec, movementLedgerDate(rec), real + estimated);
    });

    // 7. Chronological Sorting
    list.sort((a, b) => {
      const dateA = movementLedgerDate(a);
      const dateB = movementLedgerDate(b);
      return movementsSortOrder === "desc" ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    });

    return list;
  }, [financialRecords, movementMatchesFilters, movementsSortOrder]);

  // ==========================================
  // 3b. FORECAST OVERLAY — movements that have not happened yet
  // ==========================================

  // Frozen for the render, so every figure on screen is cut off at the same day.
  const forecastToday = todayLocal();

  // A rule is paused when its schedule's effective end date has already
  // passed — pausing stamps `recurringEndDate = today` rather than flipping
  // `status` (see F2 / `handleToggleRecurringActive`), and a rule paused the
  // old way, by `status` alone, reads as ended on the day it was last touched
  // (`effectiveRecurringEndDate`). This is the one place "active vs paused"
  // is decided for display.
  const isRecurringPaused = (
    rec: Pick<FinancialRecord, "recurringEndDate" | "status" | "updatedAt" | "issueDate">
  ): boolean => {
    const end = effectiveRecurringEndDate(rec);
    return !!end && end <= forecastToday;
  };

  const forecastRange = useMemo(
    () => futureWindow(forecastToday, futureHorizonMonths),
    [forecastToday, futureHorizonMonths]
  );

  // Expected movements inside the loaded window, filtered exactly like the real
  // ones. See utils/futureMovements.ts for where they come from.
  const filteredFutureMovements = useMemo(() => {
    if (!showFutureMovements) return [] as FutureMovement[];
    return projectFutureMovements(financialRecords, forecastRange.startIso, forecastRange.endIso).filter((m) =>
      movementMatchesFilters(m.record, m.date, m.amount)
    );
  }, [showFutureMovements, financialRecords, forecastRange, movementMatchesFilters]);

  // Only offer another month when widening the window would actually draw
  // something — an open-ended rule always would, a finished one never does.
  const canLoadAnotherForecastMonth = useMemo(() => {
    if (!showFutureMovements) return false;
    return hasFutureBeyond(financialRecords, forecastToday, futureHorizonMonths, (m) =>
      movementMatchesFilters(m.record, m.date, m.amount)
    );
  }, [showFutureMovements, financialRecords, forecastToday, futureHorizonMonths, movementMatchesFilters]);

  const forecastSummary = useMemo(() => futureTotals(filteredFutureMovements), [filteredFutureMovements]);

  /**
   * Records the overlay has taken over.
   *
   * An invoice issued in August and payable in October is one movement, drawn
   * on the day the money is expected — so the ledger has to stop drawing it in
   * August, or the same invoice would be counted in both months. Claims follow
   * what is actually on screen: a forecast row the filters hide leaves its
   * record exactly where it was.
   */
  const forecastClaimedIds = useMemo(() => claimedRecordIds(filteredFutureMovements), [filteredFutureMovements]);

  // ==========================================
  // 3c. PAST RECURRING CHARGES — what the rules have already charged
  // ==========================================

  // One row per charge a recurring rule has made up to and including today,
  // counted as settled — the same charges the overview table and the trend
  // count, so a month here adds up to the same figure there. Cut off at
  // `forecastToday`, the day before the overlay starts, so no charge is drawn
  // on both sides or on neither. See utils/pastRecurringCharges.ts, also for
  // how a rule's own row is drawn among its charges.
  const pastRecurring = useMemo(
    () => projectPastRecurringCharges(financialRecords, forecastToday),
    [financialRecords, forecastToday]
  );

  const filteredPastCharges = useMemo(
    () => pastRecurring.charges.filter((c) => movementMatchesFilters(c.record, c.date, c.amount)),
    [pastRecurring, movementMatchesFilters]
  );

  /** What a forecast row is derived from, in words, for its badge. */
  const forecastSourceLabel = (source: FutureMovementSource): string =>
    source === "recurring"
      ? t("Recurring", "Pravidelné", "Ismétlődő")
      : source === "due"
      ? t("Due", "Splatné", "Esedékes")
      : t("Scheduled", "Naplánované", "Ütemezett");

  // Slovak numerals agree with their noun: 1 takes the singular, 2-4 the
  // nominative plural, 5 and up the genitive.
  const skExactMonths = (n: number) => (n === 1 ? "1 mesiac" : n < 5 ? `${n} mesiace` : `${n} mesiacov`);
  const skExpected = (n: number) => (n === 1 ? "očakávaný" : n < 5 ? "očakávané" : "očakávaných");
  const skMovements = (n: number) => (n === 1 ? "pohyb" : n < 5 ? "pohyby" : "pohybov");

  /** "2 expected" / "2 očakávané" / "2 várható" — the count chip on a divider. */
  const expectedCountLabel = (n: number): string =>
    `${n} ${t("expected", skExpected(n), "várható")}`;

  const forecastHorizonLabel = (n: number): string =>
    t(`${n} month${n === 1 ? "" : "s"} ahead`, `na ${skExactMonths(n)} dopredu`, `${n} hónapra előre`);

  /** How far off a forecast row is, so a date in the table reads as a distance. */
  const daysAheadLabel = (dateIso: string): string => {
    const days = isoDaysBetween(forecastToday, dateIso);
    if (days <= 0) return t("today", "dnes", "ma");
    if (days === 1) return t("tomorrow", "zajtra", "holnap");
    return t(`in ${days} days`, `o ${days} ${days < 5 ? "dni" : "dní"}`, `${days} nap múlva`);
  };

  /**
   * Title, category and scope cells of a settled ledger line. A stored movement
   * and a charge its recurring rule made read them off the same record, so
   * both kinds of line draw them here.
   */
  const renderLedgerSourceCells = (rec: FinancialRecord) => {
    const project = projects.find((p) => p.id === rec.projectId);
    const client = leads.find((l) => l.id === rec.clientId || l.id === project?.clientId || l.id === project?.leadId);
    const catBreadcrumbs = getCategoryBreadcrumbs(rec.categoryId);
    const rootCat = catBreadcrumbs[0];
    const isExpense = rec.type === "expense";

    return (
      <>
        {/* 2. Title & Reference & Recurring Badge */}
        <td className="py-3 px-4">
          <div className="font-bold text-slate-900  flex items-center gap-1.5">
            <span className="truncate max-w-[280px]" title={rec.title}>
              {rec.title}
            </span>
            {rec.recurringSourceId && (
              <span
                data-recurring-payment="true"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 shrink-0"
                title={t(
                  "A payment of a recurring movement, edited on its own",
                  "Platba pravidelného pohybu upravená samostatne",
                  "Ismétlődő tétel külön szerkesztett fizetése"
                )}
              >
                <RefreshCw className="h-2.5 w-2.5" />
                {t("Recurring", "Pravidelné", "Ismétlődő")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {rec.invoiceNumber && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100  text-slate-600  font-semibold">
                {rec.invoiceNumber}
              </span>
            )}
            {rec.description && (
              <span className="text-[11px] text-slate-400 truncate max-w-[220px]" title={rec.description}>
                {rec.description}
              </span>
            )}
          </div>
        </td>

        {/* 3. 3-Level Category Breadcrumbs */}
        <td className="py-3 px-4">
          {catBreadcrumbs.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="h-2 w-2 rounded-full shrink-0 shadow-2xs"
                style={{ backgroundColor: rootCat?.color || (isExpense ? "#f43f5e" : "#10b981") }}
              />
              {catBreadcrumbs.map((c, idx) => (
                <React.Fragment key={c.id}>
                  {idx > 0 && <span className="text-[10px] text-slate-400">›</span>}
                  <span
                    className={`text-[11px] ${
                      idx === catBreadcrumbs.length - 1
                        ? "font-bold text-slate-800 "
                        : "font-normal text-slate-500 "
                    }`}
                  >
                    {c.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <span className="text-slate-400 italic text-[11px]">
              {t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
            </span>
          )}
        </td>

        {/* 4. Link / Scope (Project or Client or Global) */}
        <td className="py-3 px-4">
          {rec.projectId ? (
            (() => {
              const projectLead = project ? leads.find((l) => l.id === project.leadId || l.id === project.clientId) : null;
              const pName = projectLead ? `${projectLead.name}` : `Projekt ${rec.projectId.slice(0, 8)}`;
              return (
                <button
                  type="button"
                  onClick={() => onOpenProject?.(rec.projectId!)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50  hover:bg-indigo-100 text-indigo-700  rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[140px]" title={pName}>
                    {pName}
                  </span>
                </button>
              );
            })()
          ) : rec.clientId ? (
            <button
              type="button"
              onClick={() => onOpenClient?.(rec.clientId!)}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50  hover:bg-emerald-100 text-emerald-700  rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-[140px]" title={client?.name || rec.clientId}>
                {client?.name || rec.clientId.slice(0, 8)}
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
              <Globe className="h-3 w-3 text-slate-400 shrink-0" />
              <span>{t("Global Company", "Globálne firemné", "Globális vállalati")}</span>
            </span>
          )}
        </td>
      </>
    );
  };

  /** The recurring icon next to a ledger value: on a rule's own row and on every charge it made. */
  const renderRecurringValueIcon = (rec: FinancialRecord) => (
    <span
      className="p-1 rounded-md bg-purple-50  text-purple-600  border border-purple-200 "
      title={t(
        `Recurring movement (${rec.recurringFrequency || "monthly"})`,
        `Pravidelný pohyb (${rec.recurringFrequency || "mesačne"})`,
        `Rendszeres tétel (${rec.recurringFrequency || "havi"})`
      )}
    >
      <RefreshCw className="h-3 w-3" />
    </span>
  );

  // Group filtered movements by Month with summary subtotals
  const groupedMovementsByMonth = useMemo(() => {
    type Group = {
      monthKey: string; // e.g. "2026-08"
      monthLabel: string; // e.g. "August 2026"
      /** `real + estimated` — what the month is worth once everything settles. */
      totalIncome: number;
      totalExpense: number;
      /** Settled vs still-expected, split the same way `splitRecordAmounts` does everywhere else (see F4). */
      incomeReal: number;
      incomeEstimated: number;
      expenseReal: number;
      expenseEstimated: number;
      net: number;
      /** The forecast half of the month, kept apart so it never reads as settled. */
      expectedIncome: number;
      expectedExpense: number;
      expectedNet: number;
      forecastCount: number;
      rows: MovementLedgerRow[];
    };

    const rows: MovementLedgerRow[] = [];
    filteredMovements.forEach((rec) => {
      if (forecastClaimedIds.has(rec.id)) return;
      // A rule row that falls on one of its charge days is that charge: the
      // charge row below draws it, once.
      if (pastRecurring.claimedIds.has(rec.id)) return;
      rows.push({ kind: "record", key: rec.id, date: movementLedgerDate(rec) || "1970-01-01", record: rec });
    });
    filteredPastCharges.forEach((charge) => {
      rows.push({ kind: "charge", key: charge.id, date: charge.date, charge });
    });
    filteredFutureMovements.forEach((forecast) => {
      rows.push({ kind: "forecast", key: forecast.id, date: forecast.date, forecast });
    });

    rows.sort((a, b) =>
      movementsSortOrder === "desc" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
    );

    const groups: Group[] = [];
    const map = new Map<string, Group>();

    rows.forEach((row) => {
      const monthKey = row.date.slice(0, 7); // "YYYY-MM"

      let group = map.get(monthKey);
      if (!group) {
        const [yStr, mStr] = monthKey.split("-");
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10) - 1;
        const d = new Date(y, isNaN(m) ? 0 : m, 1);
        const monthName = d.toLocaleDateString(
          userLanguage === "sk" ? "sk-SK" : userLanguage === "hu" ? "hu-HU" : "en-US",
          {
            month: "long",
            year: "numeric"
          }
        );
        const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        group = {
          monthKey,
          monthLabel,
          totalIncome: 0,
          totalExpense: 0,
          incomeReal: 0,
          incomeEstimated: 0,
          expenseReal: 0,
          expenseEstimated: 0,
          net: 0,
          expectedIncome: 0,
          expectedExpense: 0,
          expectedNet: 0,
          forecastCount: 0,
          rows: []
        };
        map.set(monthKey, group);
        groups.push(group);
      }

      if (row.kind === "record" || row.kind === "charge") {
        // A past charge has happened, so all of it is settled. A rule row a
        // charge before it already covers is drawn, but adds nothing.
        const type = row.kind === "record" ? row.record.type : row.charge.type;
        const { real, estimated } =
          row.kind === "record" ? ledgerRecordSplit(row.record, pastRecurring) : { real: row.charge.amount, estimated: 0 };
        if (type === "income") {
          group.incomeReal += real;
          group.incomeEstimated += estimated;
          group.totalIncome += real + estimated;
        } else {
          group.expenseReal += real;
          group.expenseEstimated += estimated;
          group.totalExpense += real + estimated;
        }
        group.net = group.totalIncome - group.totalExpense;
      } else {
        if (row.forecast.type === "income") group.expectedIncome += row.forecast.amount;
        else group.expectedExpense += row.forecast.amount;
        group.expectedNet = group.expectedIncome - group.expectedExpense;
        group.forecastCount += 1;
      }

      group.rows.push(row);
    });

    return groups;
  }, [
    filteredMovements,
    filteredPastCharges,
    filteredFutureMovements,
    forecastClaimedIds,
    pastRecurring,
    movementsSortOrder,
    userLanguage
  ]);

  // Total summary of everything currently on the ledger, settled and expected
  // kept apart — a forecast must never be added into a figure that reads as
  // money already in the account.
  const movementsSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let incomeReal = 0;
    let incomeEstimated = 0;
    let expenseReal = 0;
    let expenseEstimated = 0;
    let recordCount = 0;
    groupedMovementsByMonth.forEach((group) => {
      income += group.totalIncome;
      expense += group.totalExpense;
      incomeReal += group.incomeReal;
      incomeEstimated += group.incomeEstimated;
      expenseReal += group.expenseReal;
      expenseEstimated += group.expenseEstimated;
      recordCount += group.rows.length - group.forecastCount;
    });
    return {
      income,
      expense,
      // Settled vs still-expected, so the ledger's own pills can finally show
      // "Real"/"Skutočnosť" apart from "Est"/"Plán" instead of one blended
      // figure with no concept of what has actually happened (see F4).
      incomeReal,
      incomeEstimated,
      expenseReal,
      expenseEstimated,
      net: income - expense,
      count: recordCount,
      expectedIncome: forecastSummary.income,
      expectedExpense: forecastSummary.expense,
      expectedNet: forecastSummary.net,
      forecastCount: filteredFutureMovements.length,
      rowCount: recordCount + filteredFutureMovements.length
    };
  }, [groupedMovementsByMonth, forecastSummary, filteredFutureMovements.length]);

  // Infinite Scroll IntersectionObserver
  useEffect(() => {
    if (activeTab !== "movements") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setMovementsVisibleCount((prev) => {
            if (prev < movementsSummary.rowCount) {
              return prev + 40;
            }
            return prev;
          });
        }
      },
      { rootMargin: "300px" }
    );

    if (movementsSentinelRef.current) {
      observer.observe(movementsSentinelRef.current);
    }

    return () => observer.disconnect();
  }, [activeTab, movementsSummary.rowCount]);

  // Reset visible count when filters change
  useEffect(() => {
    setMovementsVisibleCount(40);
  }, [
    movementsSearch,
    movementsType,
    movementsCategoryId,
    movementsScope,
    movementsProjectId,
    movementsClientId,
    movementsMinAmount,
    movementsMaxAmount,
    movementsDatePreset,
    movementsStartDate,
    movementsEndDate,
    movementsSortOrder,
    showFutureMovements,
    futureHorizonMonths
  ]);

  const hasActiveMovementsFilters =
    movementsSearch !== "" ||
    movementsType !== "all" ||
    movementsCategoryId !== "all" ||
    movementsScope !== "all" ||
    movementsProjectId !== "all" ||
    movementsClientId !== "all" ||
    movementsMinAmount !== "" ||
    movementsMaxAmount !== "" ||
    movementsDatePreset !== "all" ||
    movementsStartDate !== "" ||
    movementsEndDate !== "";

  const clearAllMovementsFilters = () => {
    setMovementsSearch("");
    setMovementsType("all");
    setMovementsCategoryId("all");
    setMovementsScope("all");
    setMovementsProjectId("all");
    setMovementsClientId("all");
    setMovementsMinAmount("");
    setMovementsMaxAmount("");
    setMovementsDatePreset("all");
    setMovementsStartDate("");
    setMovementsEndDate("");
  };

  // ==========================================
  // 4. RECURRING EXPENSES TAB STATE & LOGIC
  // ==========================================
  const [recurringSearch, setRecurringSearch] = useState("");
  const [recurringFreqFilter, setRecurringFreqFilter] = useState<string>("all");
  const [recurringStatusFilter, setRecurringStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [recurringScopeFilter, setRecurringScopeFilter] = useState<string>("all");

  // Helper to open modal for creating a new recurring expense
  const handleOpenCreateRecurringModal = (type: FinancialType = "expense", scope: "global" | "project" | "client" = "global") => {
    if (!canEdit) return;
    setEditingRecord(null);
    setEditingOccurrence(null);
    setFormType(type);
    setFormSubtype("expense");
    setFormTitle("");
    setFormDescription("");
    setFormCategoryId("");
    setFormAmountPlanned("");
    setFormAmountReal("");
    setFormStatus("planned");
    setFormIssueDate(todayLocal());
    setFormDueDate("");
    setFormPaidDate("");
    setFormPaymentMethod("bank_transfer");
    setFormScope(scope);
    setFormProjectId("");
    setFormClientId("");
    setFormInvoiceNumber("");
    setFormTaxRate(20);
    setFormIsRecurring(true);
    setFormRecurringFreq("monthly");
    setFormMonthlyType("day_of_month");
    setFormDayOfMonth(1);
    setFormWeekOfMonth(1);
    setFormWeeklyDay(1);
    setFormNthDayOfWeek(1);
    setFormYearlyMonth(1);
    setFormRecurringStartDate(todayLocal());
    setFormRecurringEndDate("");
    setFormRecurringPlannedEndDate(null);
    setFormAmountAppliesFrom("");
    setIsModalOpen(true);
  };

  // Helper to duplicate a recurring expense rule
  const handleDuplicateRecurring = (rec: FinancialRecord) => {
    const copy: FinancialRecord = {
      ...rec,
      id: `fr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: `${rec.title} (Copy)`,
      // The copy is a new rule — it never charged the original's older prices,
      // and none of its days have been replaced by a stored movement.
      recurringAmountHistory: null,
      recurringSkippedDates: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setFinancialRecords((prev) => [copy, ...prev]);
    (window as any).showToast?.(t("Recurring expense duplicated", "Pravidelný výdavok bol skopírovaný", "Ismétlődő tétel duplikálva"));
  };

  // Helper to toggle active vs paused status.
  //
  // A pause is an end date, not a status change (see F2): flipping `status`
  // used to retroactively erase or reclassify every charge the rule had
  // already made, because the aggregation guarded on `status === "cancelled"`
  // for the whole rule. `recurringCharges` already honours `recurringEndDate`
  // exactly, so pausing only needs to stop future charges — stamp today as the
  // end date; resuming clears it. `status` is left untouched either way.
  const handleToggleRecurringActive = (recId: string) => {
    const today = todayLocal();
    setFinancialRecords((prev) =>
      prev.map((r) =>
        r.id === recId
          ? { ...r, ...toggleRecurringPause(r, today), updatedAt: new Date().toISOString() }
          : r
      )
    );
  };

  // Helper to compute human-readable recurrence description
  const getRecurrenceDescription = (rec: FinancialRecord) => {
    const cfg = rec.recurringConfig || {};
    const freq = rec.recurringFrequency || "monthly";

    if (freq === "weekly") {
      const days = [
        t("Sunday", "Nedeľa", "Vasárnap"),
        t("Monday", "Pondelok", "Hétfő"),
        t("Tuesday", "Utorok", "Kedd"),
        t("Wednesday", "Streda", "Szerda"),
        t("Thursday", "Štvrtok", "Csütörtök"),
        t("Friday", "Piatok", "Péntek"),
        t("Saturday", "Sobota", "Szombat")
      ];
      const dayName = days[cfg.dayOfWeek ?? 1];
      return t(`Every week on ${dayName}`, `Každý týždeň v: ${dayName}`, `Minden héten: ${dayName}`);
    }

    if (freq === "yearly") {
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      const mName = months[(cfg.month ?? 1) - 1] || "Jan";
      return t(`Every year in ${mName}`, `Každý rok v mesiaci ${mName}`, `Minden évben: ${mName}`);
    }

    if (cfg.monthlyType === "nth_weekday") {
      const ordinals = [
        t("1st", "1.", "1."),
        t("2nd", "2.", "2."),
        t("3rd", "3.", "3."),
        t("4th", "4.", "4."),
        t("Last", "Posledný", "Utolsó")
      ];
      const days = [
        t("Sunday", "Nedeľa", "Vasárnap"),
        t("Monday", "Pondelok", "Hétfő"),
        t("Tuesday", "Utorok", "Kedd"),
        t("Wednesday", "Streda", "Szerda"),
        t("Thursday", "Štvrtok", "Csütörtök"),
        t("Friday", "Piatok", "Péntek"),
        t("Saturday", "Sobota", "Szombat")
      ];
      const ord = ordinals[(cfg.weekOfMonth ?? 1) - 1] || `${cfg.weekOfMonth}.`;
      const dName = days[cfg.dayOfWeek ?? 1];
      return t(`Monthly on the ${ord} ${dName}`, `Mesačne v: ${ord} ${dName}`, `Havonta: ${ord} ${dName}`);
    }

    const day = cfg.dayOfMonth ?? 1;
    return t(`Monthly on day ${day}`, `Mesačne ${day}. dňa`, `Havonta ${day}. napon`);
  };

  // The rule's next charge, read off the same calendar the projections use, so
  // the date in the table is the date the cash-flow week is billed on. Null once
  // the rule has run past its end date — there is no next charge to show.
  const getNextRecurringDueDate = (rec: FinancialRecord): { dateStr: string; daysLeft: number } | null => {
    const today = todayLocal();
    // Two years ahead covers the longest cadence (yearly) from any starting day.
    const next = recurringOccurrences(rec, today, shiftIsoDate(today, 731))[0];
    if (!next) return null;
    return { dateStr: next, daysLeft: Math.max(0, isoDaysBetween(today, next)) };
  };

  // Filtered recurring records list
  const filteredRecurringRecords = useMemo(() => {
    let list = financialRecords.filter((r) => r.isRecurring);

    if (recurringSearch.trim()) {
      const q = recurringSearch.toLowerCase();
      list = list.filter((r) => {
        const catBreadcrumbs = getCategoryBreadcrumbs(r.categoryId).map((c) => c.name).join(" ");
        return (
          r.title.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (catBreadcrumbs && catBreadcrumbs.toLowerCase().includes(q))
        );
      });
    }

    if (recurringFreqFilter !== "all") {
      list = list.filter((r) => (r.recurringFrequency || "monthly") === recurringFreqFilter);
    }

    if (recurringStatusFilter === "active") {
      list = list.filter((r) => !isRecurringPaused(r));
    } else if (recurringStatusFilter === "paused") {
      list = list.filter((r) => isRecurringPaused(r));
    }

    if (recurringScopeFilter === "global") {
      list = list.filter((r) => !r.projectId && !r.clientId);
    } else if (recurringScopeFilter === "project") {
      list = list.filter((r) => !!r.projectId);
    } else if (recurringScopeFilter === "client") {
      list = list.filter((r) => !!r.clientId);
    }

    return list;
  }, [financialRecords, recurringSearch, recurringFreqFilter, recurringStatusFilter, recurringScopeFilter, financialCategories, forecastToday]);

  // Summary KPIs for recurring overhead.
  //
  // Priced by summing `recurringCharges` over the next 12 months from today —
  // the same calendar-accurate, history- and end-date-aware math the Overview
  // Table already uses, so these cards can never disagree with the table for
  // the same rules (see F17). Reads the *filtered* list, so the cards respect
  // whatever is selected in the filter bar above them, the same as the list
  // they sit above (see F18). `activeCount` is whether a rule still has any
  // charge left in that forward window, not `status` — a rule whose
  // `recurringEndDate` has already passed contributes 0 and is no longer
  // "active", the same thing `isRecurringPaused` says for the row badge.
  const recurringMetrics = useMemo<{
    activeCount: number;
    pausedCount: number;
    totalMonthlyExpense: number;
    totalMonthlyIncome: number;
    totalAnnualExpense: number;
    totalAnnualIncome: number;
    nextUpcoming: { record: FinancialRecord; daysLeft: number; dateStr: string; amount: number } | null;
  }>(() => {
    const allRecurring = filteredRecurringRecords;
    const rangeStart = forecastToday;
    const rangeEnd = shiftIsoDate(forecastToday, 365);

    let totalAnnualExpense = 0;
    let totalAnnualIncome = 0;
    let activeCount = 0;

    allRecurring.forEach((r) => {
      const total = recurringTotalInRange(r, rangeStart, rangeEnd);
      if (total > 0) activeCount += 1;
      if (r.type === "income") totalAnnualIncome += total;
      else totalAnnualExpense += total;
    });

    // Find the closest upcoming recurring charge across both expense AND
    // income rules — priced at the amount that will actually be in force on
    // that date (history-aware), not a real-first snapshot of today's fields.
    let nextUpcoming: { record: FinancialRecord; daysLeft: number; dateStr: string; amount: number } | null = null;
    allRecurring.forEach((rec) => {
      const next = getNextRecurringDueDate(rec);
      if (!next) return;
      if (!nextUpcoming || next.daysLeft < nextUpcoming.daysLeft) {
        nextUpcoming = {
          record: rec,
          daysLeft: next.daysLeft,
          dateStr: next.dateStr,
          amount: recurringPlannedAmountAt(rec, next.dateStr)
        };
      }
    });

    return {
      activeCount,
      pausedCount: allRecurring.length - activeCount,
      totalMonthlyExpense: totalAnnualExpense / 12,
      totalMonthlyIncome: totalAnnualIncome / 12,
      totalAnnualExpense,
      totalAnnualIncome,
      nextUpcoming
    };
  }, [filteredRecurringRecords, forecastToday]);

  // Quick seed standard overhead templates
  const handleQuickSeedRecurringExpenses = () => {
    // Every seeded record below is an expense, so a same-named income category
    // (e.g. an income "Office services") must never win the match (see F24).
    const rentCat = financialCategories.find(c => c.type === "expense" && (c.name.includes("Nájom") || c.name.includes("Rent") || c.name.includes("Office")))?.id || null;
    const itCat = financialCategories.find(c => c.type === "expense" && (c.name.includes("Software") || c.name.includes("Hosting") || c.name.includes("IT")))?.id || null;
    const salaryCat = financialCategories.find(c => c.type === "expense" && (c.name.includes("Mzdy") || c.name.includes("Salaries") || c.name.includes("Personnel")))?.id || null;
    const accountCat = financialCategories.find(c => c.type === "expense" && (c.name.includes("Účtovníctvo") || c.name.includes("Accounting") || c.name.includes("Admin")))?.id || null;

    const templates: FinancialRecord[] = [
      {
        id: `fr-rec-${Date.now()}-1`,
        type: "expense",
        subtype: "expense",
        title: "Office Rent & Coworking Hub",
        description: "Monthly lease for central studio office and desk spaces",
        categoryId: rentCat,
        categoryPath: "Office & Rent > Coworking",
        amountPlanned: 1250,
        amountReal: 1250,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 1, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `fr-rec-${Date.now()}-2`,
        type: "expense",
        subtype: "expense",
        title: "AWS Cloud & Production Servers",
        description: "Cloud database hosting, Kubernetes cluster, and S3 storage",
        categoryId: itCat,
        categoryPath: "Software & Cloud > Hosting",
        amountPlanned: 420,
        amountReal: 420,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 15, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `fr-rec-${Date.now()}-3`,
        type: "expense",
        subtype: "expense",
        title: "Senior Lead Developer Retainer",
        description: "Core software engineering and architecture services",
        categoryId: salaryCat,
        categoryPath: "Salaries > Developers",
        amountPlanned: 3800,
        amountReal: 3800,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 25, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `fr-rec-${Date.now()}-4`,
        type: "expense",
        subtype: "expense",
        title: "Accounting & Tax Advisory Retainer",
        description: "Monthly payroll processing, VAT filings and financial reporting",
        categoryId: accountCat,
        categoryPath: "Admin & Operations > Accounting",
        amountPlanned: 290,
        amountReal: 290,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 10, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    setFinancialRecords((prev) => [...templates, ...prev]);
    (window as any).showToast?.(t("Added standard recurring overhead templates", "Pridané šablóny pravidelných výdavkov", "Alapértelmezett rendszeres kiadások hozzáadva"));
  };

  // State for Trend Graph interaction
  const [hoveredWeekIdx, setHoveredWeekIdx] = useState<number | null>(null);
  const [isWeeklyTableOpen, setIsWeeklyTableOpen] = useState(false);

  // Trend Graph Mode: "relative" (weekly net cash flow) vs "cumulative" (running
  // bank account balance).
  //
  // Which curve you are looking at is a per-user preference, so it lives in the
  // user's DB row and follows the account to another browser rather than being
  // stranded in this one's localStorage.
  const [trendMode, setTrendMode] = useUserPref("financialTrendMode");

  // How far forward the trend graph projects: 3, 6 or 12 months. Per user and
  // DB-backed for the same reason as trendMode above.
  const [projectionMonths, setProjectionMonths] = useUserPref("financialProjectionMonths");

  // Bank balances reconciled against the real statement, one per week, keyed by
  // the week's Monday ("2026-08-17").
  //
  // Shared workspace data, not a browser setting: these anchors *define* the
  // shape of the projection curve, so a balance one person verifies has to be
  // the balance everyone sees. They used to live in localStorage, which gave
  // every browser its own chart — whoever calibrated a week saw one projection
  // and every colleague saw another, built from the default starting balance.
  const weeklyBankBalances = financialTrend.weeklyBankBalances;
  const defaultBankBalance = financialTrend.currentBankBalance ?? DEFAULT_BANK_BALANCE;

  /** Write the anchors back to the shared dataset; a no-op without edit rights. */
  const saveTrend = (weekly: Record<string, number>) => {
    if (!canEdit || !setFinancialTrend) return;
    setFinancialTrend({ ...financialTrend, weeklyBankBalances: weekly });
  };

  // Modal / Popover state for calibrating any week
  const [calibratingWeek, setCalibratingWeek] = useState<{
    startIso: string;
    weekLabel: string;
    dateRangeLabel: string;
    year: number;
    currentValue: number;
    isManual: boolean;
  } | null>(null);
  const [calibratingVal, setCalibratingVal] = useState<string>("");

  const handleOpenCalibrator = (b: {
    startIso: string;
    weekLabel: string;
    dateRangeLabel: string;
    year: number;
    cumulativeBalance: number;
    isManuallyCalibrated: boolean;
  }) => {
    // Anchors are shared data now, so the server enforces the financial edit
    // permission on them. Opening the dialog for someone who cannot save would
    // show a change that silently never reaches anyone else.
    if (!canEdit || !setFinancialTrend) return;
    setCalibratingWeek({
      startIso: b.startIso,
      weekLabel: b.weekLabel,
      dateRangeLabel: b.dateRangeLabel,
      year: b.year,
      currentValue: b.cumulativeBalance,
      isManual: b.isManuallyCalibrated
    });
    setCalibratingVal(String(b.cumulativeBalance));
  };

  const handleSaveWeeklyCalibration = (startIso: string, val: number) => {
    const sanitized = isNaN(val) ? 0 : val;
    saveTrend({ ...weeklyBankBalances, [startIso]: sanitized });
    setCalibratingWeek(null);
  };

  const handleResetWeeklyCalibration = (startIso: string) => {
    const updated = { ...weeklyBankBalances };
    delete updated[startIso];
    saveTrend(updated);
    setCalibratingWeek(null);
  };

  const handleSetTrendMode = (mode: "relative" | "cumulative") => {
    setTrendMode(mode);
  };

  const handleSetProjectionMonths = (months: ProjectionMonths) => {
    setProjectionMonths(months);
  };

  // Weeks the forecast covers, and the width of the whole dataset:
  // 4 past weeks + the current one + the horizon's future weeks.
  const projectionFutureWeeks = futureWeeksFor(projectionMonths);
  const projectionTotalWeeks = TREND_PAST_WEEKS + 1 + projectionFutureWeeks;

  // Weekly dataset: 4 past weeks + current week + the selected forecast horizon
  const weeklyTrendData = useMemo(() => {
    const now = new Date();

    const getISOWeek = (d: Date) => {
      const target = new Date(d.valueOf());
      const dayNr = (d.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
      }
      return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    };

    const pad = (n: number) => String(n).padStart(2, "0");
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayIso = toYMD(now);

    // Find Monday of current week
    const currentDay = now.getDay();
    const mondayDiff = currentDay === 0 ? -6 : 1 - currentDay;
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayDiff, 0, 0, 0, 0);

    const totalPastWeeks = TREND_PAST_WEEKS;
    const totalFutureWeeks = projectionFutureWeeks;

    const buckets: {
      index: number;
      weekNum: number;
      year: number;
      weekLabel: string;
      dateRangeLabel: string;
      startIso: string;
      endIso: string;
      isPast: boolean;
      isCurrent: boolean;
      isFuture: boolean;
      incomeReal: number;
      incomePlanned: number;
      incomeProjected: number;
      totalIncome: number;
      expenseReal: number;
      expensePlanned: number;
      expenseProjected: number;
      totalExpense: number;
      netDifference: number;
      cumulativeBalance: number;
      isManuallyCalibrated: boolean;
      manualCalibratedAmount?: number;
      items: {
        title: string;
        amount: number;
        type: "income" | "expense";
        isRecurring: boolean;
        frequency?: string;
      }[];
    }[] = [];

    for (let i = -totalPastWeeks; i <= totalFutureWeeks; i++) {
      const weekStart = new Date(currentMonday);
      weekStart.setDate(weekStart.getDate() + i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const isPast = i < 0;
      const isCurrent = i === 0;
      const isFuture = i > 0;

      const startIso = toYMD(weekStart);
      const endIso = toYMD(weekEnd);
      const weekNum = getISOWeek(weekStart);
      const weekLabel = `W${weekNum}`;
      const startStr = `${pad(weekStart.getDate())}.${pad(weekStart.getMonth() + 1)}`;
      const endStr = `${pad(weekEnd.getDate())}.${pad(weekEnd.getMonth() + 1)}`;
      const dateRangeLabel = `${startStr} - ${endStr}`;

      buckets.push({
        index: i,
        weekNum,
        year: weekStart.getFullYear(),
        weekLabel,
        dateRangeLabel,
        startIso,
        endIso,
        isPast,
        isCurrent,
        isFuture,
        incomeReal: 0,
        incomePlanned: 0,
        incomeProjected: 0,
        totalIncome: 0,
        expenseReal: 0,
        expensePlanned: 0,
        expenseProjected: 0,
        totalExpense: 0,
        netDifference: 0,
        cumulativeBalance: 0,
        isManuallyCalibrated: false,
        items: []
      });
    }

    // 1. Distribute Single (Non-recurring) Records
    financialRecords.forEach((rec) => {
      if (rec.isRecurring) return;

      // Cash basis, the same rule the ledger and the overview table use (see F3).
      const recDateStr = overviewRecordDate(rec);
      if (!recDateStr) return;

      buckets.forEach((b) => {
        if (recDateStr >= b.startIso && recDateStr <= b.endIso) {
          // Settled money is real, the rest of the plan is still expected — the
          // same split the overview table uses, so a partial payment shows its
          // paid part as real here too instead of as a plan.
          const { real, estimated } = splitRecordAmounts(rec);

          if (rec.type === "income") {
            b.incomeReal += real;
            if (b.isFuture) b.incomeProjected += estimated;
            else b.incomePlanned += estimated;
          } else {
            b.expenseReal += real;
            if (b.isFuture) b.expenseProjected += estimated;
            else b.expensePlanned += estimated;
          }

          b.items.push({
            title: rec.title,
            amount: rec.amountPlanned || rec.amountReal,
            type: rec.type,
            isRecurring: false
          });
        }
      });
    });

    // 2. Project Recurring Movements across the weeks
    //
    // Each charge is priced at the amount that was in force on its own date, so
    // editing a rule's amount today does not rewrite the weeks already behind
    // us — see utils/recurringExpenses.ts.
    financialRecords.forEach((rec) => {
      if (!rec.isRecurring) return;
      // No `status === "cancelled"` guard here (see F2): a pause is an end
      // date (or, for a rule paused the old way, `effectiveRecurringEndDate`
      // reading `status`), and `recurringCharges` already stops charging past
      // it on its own — gating on `status` too used to erase every
      // already-elapsed charge the moment a rule was paused.

      const freq = rec.recurringFrequency || "monthly";

      buckets.forEach((b) => {
        recurringCharges(rec, b.startIso, b.endIso).forEach(({ date, amount: amt }) => {
          if (!amt) return;
          // A charge is real once its date has arrived, whatever week it
          // falls in — the same rule the overview table uses (Problem A):
          // past weeks are always settled, future weeks never are, and the
          // current week splits on the charge's own date rather than being
          // real or projected as a whole.
          const settled = isRecurringChargeSettled(date, todayIso);

          if (rec.type === "income") {
            if (settled) {
              b.incomeReal += amt;
            } else {
              b.incomeProjected += amt;
            }
          } else {
            if (settled) {
              b.expenseReal += amt;
            } else {
              b.expenseProjected += amt;
            }
          }

          b.items.push({
            title: `🔄 ${rec.title}`,
            amount: amt,
            type: rec.type,
            isRecurring: true,
            frequency: freq
          });
        });
      });

      // The rule's own row, when it precedes its schedule — the same first
      // charge the overview table counts (see `recurringOwnRowCharge`).
      const ownRow = recurringOwnRowCharge(rec);
      const ownBucket = ownRow && buckets.find((b) => ownRow.date >= b.startIso && ownRow.date <= b.endIso);
      if (ownRow && ownBucket) {
        if (rec.type === "income") {
          ownBucket.incomeReal += ownRow.real;
          if (ownBucket.isFuture) ownBucket.incomeProjected += ownRow.estimated;
          else ownBucket.incomePlanned += ownRow.estimated;
        } else {
          ownBucket.expenseReal += ownRow.real;
          if (ownBucket.isFuture) ownBucket.expenseProjected += ownRow.estimated;
          else ownBucket.expensePlanned += ownRow.estimated;
        }
        ownBucket.items.push({
          title: `🔄 ${rec.title}`,
          amount: ownRow.real + ownRow.estimated,
          type: rec.type,
          isRecurring: true,
          frequency: freq
        });
      }
    });

    // 3. Final totals & Net Difference per week
    buckets.forEach((b) => {
      b.totalIncome = b.incomeReal + b.incomePlanned + b.incomeProjected;
      b.totalExpense = b.expenseReal + b.expensePlanned + b.expenseProjected;
      b.netDifference = b.totalIncome - b.totalExpense;
    });

    // 4. Calculate Cumulative Running Bank Account Balance across the 18 Weeks with multi-anchor support
    const explicitAnchors: number[] = [];
    buckets.forEach((b, idx) => {
      if (weeklyBankBalances[b.startIso] !== undefined) {
        b.isManuallyCalibrated = true;
        b.manualCalibratedAmount = weeklyBankBalances[b.startIso];
        b.cumulativeBalance = weeklyBankBalances[b.startIso];
        explicitAnchors.push(idx);
      } else {
        b.isManuallyCalibrated = false;
      }
    });

    const currentIdx = buckets.findIndex((b) => b.isCurrent);

    if (explicitAnchors.length === 0) {
      // Fallback: Use default starting balance anchored at current week
      const anchorIdx = currentIdx !== -1 ? currentIdx : 0;
      buckets[anchorIdx].cumulativeBalance = defaultBankBalance;

      // Forward into future weeks
      for (let i = anchorIdx + 1; i < buckets.length; i++) {
        buckets[i].cumulativeBalance = buckets[i - 1].cumulativeBalance + buckets[i].netDifference;
      }

      // Backward into past weeks
      for (let i = anchorIdx - 1; i >= 0; i--) {
        buckets[i].cumulativeBalance = buckets[i + 1].cumulativeBalance - buckets[i + 1].netDifference;
      }
    } else {
      // 1. Process backward before the earliest anchor
      const firstAnchor = explicitAnchors[0];
      for (let i = firstAnchor - 1; i >= 0; i--) {
        buckets[i].cumulativeBalance = buckets[i + 1].cumulativeBalance - buckets[i + 1].netDifference;
      }

      // 2. Process between anchors
      for (let a = 0; a < explicitAnchors.length - 1; a++) {
        const fromIdx = explicitAnchors[a];
        const toIdx = explicitAnchors[a + 1];
        for (let i = fromIdx + 1; i < toIdx; i++) {
          buckets[i].cumulativeBalance = buckets[i - 1].cumulativeBalance + buckets[i].netDifference;
        }
      }

      // 3. Process forward after the latest anchor
      const lastAnchor = explicitAnchors[explicitAnchors.length - 1];
      for (let i = lastAnchor + 1; i < buckets.length; i++) {
        buckets[i].cumulativeBalance = buckets[i - 1].cumulativeBalance + buckets[i].netDifference;
      }
    }

    return buckets;
  }, [financialRecords, weeklyBankBalances, defaultBankBalance, projectionFutureWeeks]);

  // Smooth Bezier path generator for SVG plotline
  const generateSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const generateAreaPath = (pts: { x: number; y: number }[], baseY: number) => {
    if (pts.length === 0) return "";
    const smooth = generateSmoothPath(pts);
    return `${smooth} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  };

  // Build hierarchical category helper for forms and tree view
  const categoryTree = useMemo(() => {
    const buildTree = (type: FinancialType) =>
      categoryChildren(financialCategories, type, null).map((root) => ({
        ...root,
        children: categoryChildren(financialCategories, type, root.id).map((l2) => ({
          ...l2,
          children: categoryChildren(financialCategories, type, l2.id)
        }))
      }));

    return {
      incomeTree: buildTree("income"),
      expenseTree: buildTree("expense")
    };
  }, [financialCategories]);

  // Categories tab: dragging a row rewrites its position, level and parent together.
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState<CategoryDropTarget | null>(null);
  const categoryTreeRef = useRef<HTMLDivElement | null>(null);
  useDragAutoScroll(draggedCategoryId !== null, categoryTreeRef);

  // A colour picker fires on every pixel the pointer crosses, so the swatch
  // previews a local draft and only the colour the user settles on is saved.
  const [categoryColorDrafts, setCategoryColorDrafts] = useState<Record<string, string>>({});
  const categoryColorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Overview Table Matrix Data Calculation Hook
  const overviewTableData = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const todayIso = toYMD(now);

    // 1. Build Period Columns based on tableGranularity
    let columns: {
      id: string;
      label: string;
      subLabel?: string;
      startDate: Date;
      endDate: Date;
      startIso: string;
      endIso: string;
      isCurrent: boolean;
      isFuture: boolean;
    }[] = [];

    if (tableGranularity === "month") {
      const monthNames = [
        t("Jan", "Jan", "Jan"),
        t("Feb", "Feb", "Feb"),
        t("Mar", "Mar", "Már"),
        t("Apr", "Apr", "Ápr"),
        t("May", "Máj", "Máj"),
        t("Jun", "Jún", "Jún"),
        t("Jul", "Júl", "Júl"),
        t("Aug", "Aug", "Aug"),
        t("Sep", "Sep", "Sze"),
        t("Oct", "Okt", "Okt"),
        t("Nov", "Nov", "Nov"),
        t("Dec", "Dec", "Dec")
      ];

      columns = Array.from({ length: 12 }, (_, m) => {
        const startDate = new Date(tableYear, m, 1, 0, 0, 0, 0);
        const endDate = new Date(tableYear, m + 1, 0, 23, 59, 59, 999);
        const isCurrent = now.getFullYear() === tableYear && now.getMonth() === m;
        const isFuture = new Date(tableYear, m, 1) > now;

        return {
          id: `${tableYear}-${pad(m + 1)}`,
          label: `${monthNames[m]}`,
          subLabel: `${tableYear}`,
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else if (tableGranularity === "quarter") {
      columns = [
        { id: `${tableYear}-Q1`, label: `Q1`, subLabel: t("Jan - Mar", "Jan - Mar", "Jan - Már"), startMonth: 0, endMonth: 2 },
        { id: `${tableYear}-Q2`, label: `Q2`, subLabel: t("Apr - Jun", "Apr - Jún", "Ápr - Jún"), startMonth: 3, endMonth: 5 },
        { id: `${tableYear}-Q3`, label: `Q3`, subLabel: t("Jul - Sep", "Júl - Sep", "Júl - Sze"), startMonth: 6, endMonth: 8 },
        { id: `${tableYear}-Q4`, label: `Q4`, subLabel: t("Oct - Dec", "Okt - Dec", "Okt - Dec"), startMonth: 9, endMonth: 11 }
      ].map((q) => {
        const startDate = new Date(tableYear, q.startMonth, 1, 0, 0, 0, 0);
        const endDate = new Date(tableYear, q.endMonth + 1, 0, 23, 59, 59, 999);
        const isCurrent = now >= startDate && now <= endDate;
        const isFuture = startDate > now;

        return {
          id: q.id,
          label: q.label,
          subLabel: `${q.subLabel} ${tableYear}`,
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else if (tableGranularity === "half") {
      columns = [
        { id: `${tableYear}-H1`, label: `H1`, subLabel: t("Jan - Jun", "Jan - Jún", "Jan - Jún"), startMonth: 0, endMonth: 5 },
        { id: `${tableYear}-H2`, label: `H2`, subLabel: t("Jul - Dec", "Júl - Dec", "Júl - Dec"), startMonth: 6, endMonth: 11 }
      ].map((h) => {
        const startDate = new Date(tableYear, h.startMonth, 1, 0, 0, 0, 0);
        const endDate = new Date(tableYear, h.endMonth + 1, 0, 23, 59, 59, 999);
        const isCurrent = now >= startDate && now <= endDate;
        const isFuture = startDate > now;

        return {
          id: h.id,
          label: h.label,
          subLabel: `${h.subLabel} ${tableYear}`,
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else if (tableGranularity === "year") {
      const years = [tableYear - 2, tableYear - 1, tableYear, tableYear + 1, tableYear + 2];
      columns = years.map((y) => {
        const startDate = new Date(y, 0, 1, 0, 0, 0, 0);
        const endDate = new Date(y, 11, 31, 23, 59, 59, 999);
        const isCurrent = now.getFullYear() === y;
        const isFuture = y > now.getFullYear();

        return {
          id: `${y}`,
          label: `${y}`,
          subLabel: t("Year", "Rok", "Év"),
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else {
      // Weekly columns
      columns = weeklyTrendData.map((w) => ({
        id: w.startIso,
        label: w.weekLabel,
        subLabel: w.dateRangeLabel,
        startDate: new Date(w.startIso),
        endDate: new Date(w.endIso),
        startIso: w.startIso,
        endIso: w.endIso,
        isCurrent: w.isCurrent,
        isFuture: w.isFuture
      }));
    }

    // 2. Aggregate every movement into the matrix — which row it lands on, how
    // much of it is settled versus still expected, and how the category levels
    // roll up — lives in utils/financialOverviewTable.ts so it can be unit-tested.
    return { columns, ...aggregateOverviewTable(financialRecords, financialCategories, columns, todayIso) };
  }, [financialCategories, financialRecords, tableGranularity, tableYear, weeklyTrendData]);

  // Helper to render a cell value formatted by tableValueMode with distinct colors (Expense = Red, Income = Green)
  // and reduced font size for expanded child categories (Level 2 & Level 3)
  const renderTableCellValue = (
    val: { real: number; estimated: number; total: number },
    colorType: "expense" | "income" | "net" = "income",
    level: number = 1
  ) => {
    if (!val || (val.real === 0 && val.estimated === 0 && val.total === 0)) {
      return <span className="text-slate-300  font-normal select-none">—</span>;
    }

    const isExpense = colorType === "expense";
    const isIncome = colorType === "income";

    const realColorClass = isExpense
      ? "text-rose-600 "
      : isIncome
      ? "text-emerald-600 "
      : val.real >= 0
      ? "text-emerald-600 "
      : "text-rose-600 ";

    const estColorClass = isExpense
      ? "text-rose-400 "
      : isIncome
      ? "text-emerald-400 "
      : val.estimated >= 0
      ? "text-emerald-400 "
      : "text-rose-400 ";

    const totalColorClass = isExpense
      ? "text-rose-700 "
      : isIncome
      ? "text-emerald-700 "
      : val.total >= 0
      ? "text-emerald-700 "
      : "text-rose-700 ";

    // Typography size scaling: Level 1 = standard text-xs (12px), Level 2 = text-[10.5px], Level 3 = text-[9.5px]
    const mainTextSize = level === 1 ? "text-xs" : level === 2 ? "text-[10.5px]" : "text-[9.5px]";
    const estTextSize = level === 1 ? "text-[9px]" : "text-[8px]";
    const mainFontWeight = level === 1 ? "font-bold" : level === 2 ? "font-semibold" : "font-medium";

    if (tableValueMode === "real") {
      return val.real !== 0 ? (
        <span className={`${mainFontWeight} ${mainTextSize} ${realColorClass}`}>{money(val.real)}</span>
      ) : (
        <span className="text-slate-300  font-normal select-none">—</span>
      );
    }

    if (tableValueMode === "estimated") {
      return val.estimated !== 0 ? (
        <span className={`font-medium ${mainTextSize} ${estColorClass}`}>{money(val.estimated)}</span>
      ) : (
        <span className="text-slate-300  font-normal select-none">—</span>
      );
    }

    if (tableValueMode === "total") {
      return <span className={`${mainFontWeight} ${mainTextSize} ${totalColorClass}`}>{money(val.total)}</span>;
    }

    // Both mode (Default): Real on top, Estimated below
    return (
      <div className="flex flex-col items-end leading-tight py-0.5">
        {val.real !== 0 ? (
          <span className={`${mainFontWeight} ${mainTextSize} ${realColorClass}`}>{money(val.real)}</span>
        ) : (
          <span className="text-slate-300  font-normal text-[10px]">—</span>
        )}
        {val.estimated !== 0 && (
          <span className={`${estTextSize} font-medium ${estColorClass}`}>
            est: {money(val.estimated)}
          </span>
        )}
      </div>
    );
  };

  // Helper to render recursive category rows in Overview Table Matrix
  const renderCategoryMatrixRow = (cat: any, level: number = 1, type: "expense" | "income" = "expense"): React.ReactNode => {
    const isExpanded = expandedCatIds.has(cat.id);
    const hasChildren = cat.children && cat.children.length > 0;
    const catTotal = overviewTableData.rowTotals[cat.id] || { real: 0, estimated: 0, total: 0 };

    // Search query filter: if searching, only show matching or if children match
    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase();
      const matchesSelf = cat.name.toLowerCase().includes(q);
      const matchesChild = cat.children?.some((c: any) => c.name.toLowerCase().includes(q) || c.children?.some((c3: any) => c3.name.toLowerCase().includes(q)));
      if (!matchesSelf && !matchesChild) return null;
    }

    return (
      <React.Fragment key={"cat-row-" + cat.id}>
        <tr
          className={`hover:bg-slate-50  transition-colors ${
            level === 1
              ? "bg-slate-50/60  font-bold"
              : level === 2
              ? "bg-white  text-xs font-semibold"
              : "bg-white  text-xs font-normal text-slate-600 "
          }`}
        >
          {/* Category Name Cell (Sticky Left with solid background and crisp right border) */}
          <td
            className={`w-[320px] min-w-[320px] max-w-[320px] py-2 px-3 sticky left-0 z-20 border-r-2 border-slate-200  shadow-[2px_0_4px_rgba(0,0,0,0.04)] select-none ${
              level === 1
                ? "bg-slate-50  font-bold text-xs text-slate-900 "
                : level === 2
                ? "bg-white  pl-7 font-semibold text-[11px] text-slate-800 "
                : "bg-white  pl-12 font-normal text-[10px] text-slate-600 "
            }`}
          >
            <div
              className={`flex items-center gap-1.5 ${hasChildren ? "cursor-pointer" : ""}`}
              onClick={() => hasChildren && toggleCategoryExpand(cat.id)}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="p-0.5 text-slate-400 hover:text-slate-700  transition-transform cursor-pointer"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? "rotate-90 text-purple-600" : ""}`}
                  />
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}

              {level === 1 ? (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: cat.color || (type === "expense" ? "#f43f5e" : "#10b981") }}
                />
              ) : (
                <span className="text-slate-400  text-[10px] shrink-0">
                  {level === 2 ? "↳" : "↳↳"}
                </span>
              )}

              <span className="truncate max-w-[220px]" title={cat.name}>
                {cat.name}
              </span>
            </div>
          </td>

          {/* Period Columns */}
          {overviewTableData.columns.map((col) => {
            const cellVal = overviewTableData.cells[cat.id]?.[col.id] || { real: 0, estimated: 0, total: 0 };
            return (
              <td
                key={cat.id + "-" + col.id}
                className={`py-1.5 px-3 text-right ${
                  col.isCurrent ? "bg-indigo-50/20  border-x border-indigo-100 " : ""
                }`}
              >
                {renderTableCellValue(cellVal, type, level)}
              </td>
            );
          })}

          {/* Row Total (Sticky Right with solid background) */}
          <td className="py-1.5 px-4 text-right font-bold bg-slate-50  border-l border-slate-200  sticky right-0 z-20">
            {renderTableCellValue(catTotal, type, level)}
          </td>
        </tr>

        {/* Render nested children if expanded */}
        {hasChildren && isExpanded && cat.children.map((child: any) => renderCategoryMatrixRow(child, level + 1, type))}
      </React.Fragment>
    );
  };

  // The row for movements that have no usable category: none set, the category
  // deleted, or a category from the other side of the ledger. It is a level-1
  // row of its section, so what it holds is part of the section's totals and
  // cannot go missing from "Skutočnosť" just because nobody filed it yet.
  const renderUncategorizedMatrixRow = (type: "expense" | "income"): React.ReactNode => {
    const rowId = UNCATEGORIZED_ROW_ID[type];
    if (!overviewTableData.hasUncategorized[type]) return null;

    const label = t("Uncategorized", "Bez kategórie", "Kategória nélkül");
    const q = tableSearchQuery.trim().toLowerCase();
    if (q && !label.toLowerCase().includes(q)) return null;

    const rowTotal = overviewTableData.rowTotals[rowId] || { real: 0, estimated: 0, total: 0 };

    return (
      <tr
        key={"cat-row-" + rowId}
        data-uncategorized-row={type}
        className="hover:bg-slate-50  transition-colors bg-slate-50/60  font-bold"
      >
        <td className="w-[320px] min-w-[320px] max-w-[320px] py-2 px-3 sticky left-0 z-20 border-r-2 border-slate-200  shadow-[2px_0_4px_rgba(0,0,0,0.04)] select-none bg-slate-50  font-bold text-xs text-slate-500  italic">
          <div
            className="flex items-center gap-1.5"
            title={t(
              "Movements without a category, or whose category no longer exists. Assign one in the Movements tab.",
              "Pohyby bez kategórie alebo s kategóriou, ktorá už neexistuje. Kategóriu im priradíte v záložke Pohyby.",
              "Kategória nélküli mozgások, vagy amelyek kategóriája már nem létezik. A Mozgások fülön rendelhet hozzájuk kategóriát."
            )}
          >
            <span className="w-3.5 shrink-0" />
            <span className="h-2.5 w-2.5 rounded-full shrink-0 border border-dashed border-slate-400" />
            <span className="truncate max-w-[220px]">{label}</span>
          </div>
        </td>

        {overviewTableData.columns.map((col) => {
          const cellVal = overviewTableData.cells[rowId]?.[col.id] || { real: 0, estimated: 0, total: 0 };
          return (
            <td
              key={rowId + "-" + col.id}
              className={`py-1.5 px-3 text-right ${col.isCurrent ? "bg-indigo-50/20  border-x border-indigo-100 " : ""}`}
            >
              {renderTableCellValue(cellVal, type, 1)}
            </td>
          );
        })}

        <td className="py-1.5 px-4 text-right font-bold bg-slate-50  border-l border-slate-200  sticky right-0 z-20">
          {renderTableCellValue(rowTotal, type, 1)}
        </td>
      </tr>
    );
  };

  // Switching the side of the ledger drops a category from the other side. The
  // picker only offers matching categories, but it kept whatever was already
  // selected, so an income could be saved under an expense category.
  const switchFormType = (type: FinancialType) => {
    setFormType(type);
    if (formCategoryId) {
      const cat = financialCategories.find((c) => c.id === formCategoryId);
      if (cat && cat.type !== type) setFormCategoryId("");
    }
  };

  // Open Creation Modal with preset type & scope
  const handleOpenCreateModal = (type: FinancialType, defaultScope: "global" | "project" | "client" = "global") => {
    if (!canEdit) return;
    setEditingRecord(null);
    setEditingOccurrence(null);
    setFormType(type);
    setFormSubtype(type === "income" ? "invoice" : "regular");
    setFormTitle("");
    setFormDescription("");
    setFormCategoryId("");
    setFormAmountPlanned("");
    setFormAmountReal("");
    setFormStatus(type === "income" ? "pending" : "planned");
    setFormIssueDate(todayLocal());
    setFormDueDate("");
    setFormPaidDate("");
    setFormPaymentMethod("bank_transfer");
    setFormScope(defaultScope);
    setFormProjectId("");
    setFormClientId("");
    setFormInvoiceNumber(type === "income" ? `FA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : "");
    setFormTaxRate(20);
    setFormIsRecurring(false);
    setFormRecurringFreq("monthly");
    setFormWeeklyDay(1);
    setFormMonthlyType("day_of_month");
    setFormDayOfMonth(1);
    setFormWeekOfMonth(1);
    setFormNthDayOfWeek(1);
    setFormYearlyMonth(1);
    setFormRecurringStartDate(todayLocal());
    setFormRecurringEndDate("");
    setFormRecurringPlannedEndDate(null);
    setFormAmountAppliesFrom("");
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (rec: FinancialRecord) => {
    setEditingRecord(rec);
    setEditingOccurrence(null);
    setFormType(rec.type);
    setFormSubtype(rec.subtype || "regular");
    setFormTitle(rec.title);
    setFormDescription(rec.description || "");
    setFormCategoryId(rec.categoryId || "");
    setFormAmountPlanned(rec.amountPlanned);
    setFormAmountReal(rec.amountReal);
    setFormStatus(rec.status);
    setFormIssueDate(rec.issueDate || todayLocal());
    setFormDueDate(rec.dueDate || "");
    setFormPaidDate(rec.paidDate || "");
    setFormPaymentMethod(rec.paymentMethod || "bank_transfer");
    setFormScope(movementScope(rec));
    setFormProjectId(rec.projectId || "");
    setFormClientId(rec.clientId || "");
    setFormInvoiceNumber(rec.invoiceNumber || "");
    setFormTaxRate(rec.taxRate ?? 20);
    setFormIsRecurring(rec.isRecurring || false);
    setFormRecurringFreq(rec.recurringFrequency || "monthly");

    const cfg = rec.recurringConfig || {};
    setFormWeeklyDay(cfg.dayOfWeek ?? 1);
    setFormMonthlyType(cfg.monthlyType ?? "day_of_month");
    setFormDayOfMonth(cfg.dayOfMonth ?? 1);
    setFormWeekOfMonth(cfg.weekOfMonth ?? 1);
    setFormNthDayOfWeek(cfg.dayOfWeek ?? 1);
    setFormYearlyMonth(cfg.month ?? 1);
    setFormRecurringStartDate(rec.recurringStartDate || rec.issueDate || todayLocal());
    setFormRecurringEndDate(rec.recurringEndDate || "");
    setFormRecurringPlannedEndDate(rec.recurringPlannedEndDate || null);
    setFormAmountAppliesFrom("");

    setIsModalOpen(true);
  };

  /**
   * Open one charge of a recurring rule for editing on its own: the day it
   * was charged, what it cost and whether it was paid — never the rule's
   * title, category, scope or schedule, which are set once on the rule and
   * edited on the Recurring tab. Saving stores a one-off movement that stands
   * in for that day and lists the day in the rule's `recurringSkippedDates`,
   * so every tab stops charging it (see utils/recurringExpenses.ts).
   */
  const handleOpenOccurrenceModal = (rule: FinancialRecord, date: string, existing: FinancialRecord | null = null) => {
    if (!canEdit) return;
    setEditingRecord(existing);
    setEditingOccurrence({ rule, date, existing });
    const base = existing || rule;
    setFormType(rule.type);
    setFormSubtype(base.subtype || "regular");
    setFormTitle(existing?.title || rule.title);
    setFormDescription(existing?.description || "");
    setFormCategoryId(base.categoryId || "");
    setFormScope(movementScope(base));
    setFormProjectId(base.projectId || "");
    setFormClientId(base.clientId || "");
    setFormInvoiceNumber(existing?.invoiceNumber || "");
    setFormTaxRate(base.taxRate ?? 20);
    setFormPaymentMethod(base.paymentMethod || "bank_transfer");
    setFormIsRecurring(false);
    setFormAmountAppliesFrom("");

    const ownRow = recurringOwnRowCharge(rule);
    if (existing) {
      setFormAmountPlanned(existing.amountPlanned);
      setFormAmountReal(existing.amountReal);
      setFormStatus(existing.status);
      setFormIssueDate(existing.paidDate || existing.issueDate || date);
      setFormDueDate(existing.dueDate || "");
      setFormPaidDate(existing.paidDate || "");
    } else if (ownRow && ownRow.date === date) {
      // The rule's own first payment: it carries its own status and amounts.
      setFormAmountPlanned(rule.amountPlanned);
      setFormAmountReal(rule.amountReal);
      setFormStatus(rule.status);
      setFormIssueDate(rule.paidDate || rule.issueDate || date);
      setFormDueDate(rule.dueDate || "");
      setFormPaidDate(rule.paidDate || "");
    } else {
      // A charge the schedule made: priced at the amount in force that day,
      // settled once the day has arrived, still expected otherwise — exactly
      // how the ledger has been drawing it.
      const amount = recurringPlannedAmountAt(rule, date);
      const settled = isRecurringChargeSettled(date, todayLocal());
      setFormAmountPlanned(amount);
      setFormAmountReal(settled ? amount : "");
      setFormStatus(settled ? "paid" : "planned");
      setFormIssueDate(date);
      setFormDueDate("");
      setFormPaidDate(settled ? date : "");
    }
    setIsModalOpen(true);
  };

  /**
   * What the pencil on a ledger row opens. The ledger edits single movements:
   * a recurring rule's own first payment opens as that one payment, a
   * movement standing in for a rule's charge opens against its rule, and a
   * plain movement opens as itself. A rule row that is only the rule (its
   * payments are drawn as charge rows beside it) has nothing of its own to
   * edit here, so it opens the rule — the same editor the Recurring tab has.
   */
  const handleOpenLedgerRow = (rec: FinancialRecord) => {
    if (rec.recurringSourceId && rec.recurringOccurrenceDate) {
      const rule = financialRecords.find((r) => r.id === rec.recurringSourceId && r.isRecurring);
      if (rule) {
        handleOpenOccurrenceModal(rule, rec.recurringOccurrenceDate, rec);
        return;
      }
    }
    if (rec.isRecurring) {
      const ownRow = recurringOwnRowCharge(rec);
      if (ownRow) {
        handleOpenOccurrenceModal(rec, ownRow.date);
        return;
      }
    }
    handleOpenEditModal(rec);
  };

  /**
   * Save one edited charge of a recurring rule as a movement of its own. The
   * rule keeps everything it was set up with — only this day's money changes:
   * the movement carries the day, the amounts and the status, and the rule
   * lists the day among those it no longer charges.
   */
  const handleSaveOccurrence = () => {
    if (!editingOccurrence) return;
    const { rule, date, existing } = editingOccurrence;
    const now = new Date().toISOString();
    const day = formIssueDate || date;
    const movement: FinancialRecord = {
      id: existing?.id || `fr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: rule.type,
      subtype: existing?.subtype || rule.subtype || "regular",
      title: formTitle.trim() || rule.title,
      description: formDescription.trim() || null,
      categoryId: rule.categoryId || null,
      categoryPath: rule.categoryPath || null,
      amountPlanned: Number(formAmountPlanned) || 0,
      amountReal: Number(formAmountReal) || 0,
      currency: rule.currency || currencyCode || "EUR",
      status: formStatus,
      // One day is the day of the payment: filed under it whether it is
      // settled or still open, so the row keeps the date the user typed.
      issueDate: day,
      dueDate: formDueDate || null,
      paidDate: statusNeedsRealAmount(formStatus) ? day : null,
      paymentMethod: existing?.paymentMethod || rule.paymentMethod || "bank_transfer",
      isRecurring: false,
      recurringFrequency: null,
      recurringConfig: null,
      recurringStartDate: null,
      recurringEndDate: null,
      recurringPlannedEndDate: null,
      recurringAmountHistory: null,
      recurringSkippedDates: null,
      recurringSourceId: rule.id,
      recurringOccurrenceDate: date,
      projectId: rule.projectId || null,
      clientId: rule.clientId || null,
      invoiceNumber: formInvoiceNumber.trim() || null,
      taxRate: existing?.taxRate ?? rule.taxRate ?? 20,
      attachments: existing?.attachments || [],
      createdBy: existing?.createdBy || (window as any).ccrmCurrentUser?.email || "Admin",
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    setFinancialRecords((prev) => {
      const skipped = skipRecurringDate(rule, date);
      const next = prev.map((r) => (r.id === rule.id ? { ...r, recurringSkippedDates: skipped } : r));
      return next.some((r) => r.id === movement.id)
        ? next.map((r) => (r.id === movement.id ? movement : r))
        : [movement, ...next];
    });

    handleCloseModal();
    (window as any).showToast?.(
      t("Payment saved — the rule is unchanged", "Platba uložená — pravidlo zostáva bez zmeny", "Fizetés mentve — a szabály változatlan")
    );
  };

  /** The recurring rule exactly as the form currently describes it. */
  const formRecurringRule = (): RecurringRule => ({
    amountPlanned: Number(formAmountPlanned) || 0,
    amountReal: Number(formAmountReal) || 0,
    isRecurring: formIsRecurring,
    recurringFrequency: formRecurringFreq,
    recurringConfig: {
      dayOfWeek: formRecurringFreq === "weekly" ? formWeeklyDay : formNthDayOfWeek,
      monthlyType: formMonthlyType,
      dayOfMonth: formDayOfMonth,
      weekOfMonth: formWeekOfMonth,
      month: formYearlyMonth
    },
    recurringStartDate: formRecurringStartDate,
    recurringEndDate: formRecurringEndDate || null,
    recurringAmountHistory: editingRecord?.recurringAmountHistory || null
  });

  /**
   * The first day a changed recurring amount is in force: the date picked in
   * the form, else the rule's next charge after today, else today.
   */
  const repriceFrom = (): string =>
    formAmountAppliesFrom || nextRecurringChargeAfter(formRecurringRule(), todayLocal()) || todayLocal();

  // Save Transaction
  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOccurrence) {
      handleSaveOccurrence();
      return;
    }
    if (!formTitle.trim()) {
      alert(t("Title is required", "Názov záznamu je povinný", "A megnevezés kitöltése kötelező"));
      return;
    }

    // Resolve category path for breadcrumb display
    let path = "";
    if (formCategoryId) {
      const cat = financialCategories.find((c) => c.id === formCategoryId);
      if (cat) {
        if (cat.level === 3 && cat.parentId) {
          const l2 = financialCategories.find((c) => c.id === cat.parentId);
          const l1 = l2?.parentId ? financialCategories.find((c) => c.id === l2.parentId) : null;
          path = [l1?.name, l2?.name, cat.name].filter(Boolean).join(" > ");
        } else if (cat.level === 2 && cat.parentId) {
          const l1 = financialCategories.find((c) => c.id === cat.parentId);
          path = [l1?.name, cat.name].filter(Boolean).join(" > ");
        } else {
          path = cat.name;
        }
      }
    }

    const recConfig = formIsRecurring ? formRecurringRule().recurringConfig : null;

    const nextAmounts = {
      amountPlanned: Number(formAmountPlanned) || 0,
      amountReal: Number(formAmountReal) || 0
    };

    // Changing what a recurring rule costs must not re-price the charges it has
    // already made: the old amount is pinned up to the day before the new one
    // takes effect — the next charge unless the form says otherwise. A one-off
    // record has nothing to pin.
    const amountHistory =
      editingRecord && editingRecord.isRecurring && formIsRecurring
        ? recurringAmountHistoryAfterChange(editingRecord, nextAmounts, repriceFrom())
        : formIsRecurring
          ? editingRecord?.recurringAmountHistory || null
          : null;

    const recordPayload: FinancialRecord = {
      id: editingRecord?.id || `fr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: formType,
      subtype: formSubtype,
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      categoryId: formCategoryId || null,
      categoryPath: path || null,
      amountPlanned: nextAmounts.amountPlanned,
      amountReal: nextAmounts.amountReal,
      currency: currencyCode || "EUR",
      status: formStatus,
      issueDate: formIssueDate,
      dueDate: formDueDate || null,
      paidDate: formStatus === "paid" ? (formPaidDate || todayLocal()) : (formPaidDate || null),
      paymentMethod: formPaymentMethod || "bank_transfer",
      isRecurring: formIsRecurring,
      recurringFrequency: formIsRecurring ? formRecurringFreq : null,
      recurringConfig: recConfig,
      recurringStartDate: formIsRecurring ? formRecurringStartDate : null,
      recurringEndDate: formIsRecurring ? formRecurringEndDate || null : null,
      recurringPlannedEndDate: formIsRecurring ? formRecurringPlannedEndDate || null : null,
      recurringAmountHistory: amountHistory,
      projectId: formScope === "project" && formProjectId ? formProjectId : null,
      clientId: formScope === "client" && formClientId ? formClientId : (formScope === "project" && formProjectId ? (projects.find(p => p.id === formProjectId)?.clientId || projects.find(p => p.id === formProjectId)?.leadId || null) : null),
      invoiceNumber: formInvoiceNumber.trim() || null,
      taxRate: formTaxRate,
      attachments: editingRecord?.attachments || [],
      createdBy: editingRecord?.createdBy || (window as any).ccrmCurrentUser?.email || "Admin",
      createdAt: editingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setFinancialRecords((prev) => {
      const exists = prev.some((r) => r.id === recordPayload.id);
      if (exists) {
        return prev.map((r) => (r.id === recordPayload.id ? recordPayload : r));
      }
      return [recordPayload, ...prev];
    });

    handleCloseModal();
    (window as any).showToast?.(t("Financial record saved!", "Finančný záznam bol uložený!", "Pénzügyi tétel mentve!"));
  };

  // ==========================================
  // INLINE PAYMENT STATUS EDITING (MOVEMENTS LEDGER)
  // ==========================================

  /**
   * The row-level status picker waiting for the settled amount. `paid` and
   * `partially_paid` both write `amountReal`, so the dropdown parks the intended
   * status here and only commits once the user confirms a number.
   */
  const [statusPrompt, setStatusPrompt] = useState<{
    record: FinancialRecord;
    nextStatus: "paid" | "partially_paid";
    amount: string;
  } | null>(null);
  const statusPromptInputRef = useRef<HTMLInputElement | null>(null);

  const patchMovement = (id: string, patch: Partial<FinancialRecord>) => {
    setFinancialRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r))
    );
  };

  const handleInlineStatusChange = (rec: FinancialRecord, nextStatus: FinancialStatus) => {
    if (!canEdit || nextStatus === rec.status) return;

    if (rec.isRecurring && nextStatus === "cancelled") {
      // "Zrušené" on a recurring rule's own row pauses the schedule instead
      // of marking the row cancelled (option A of Problem B, finance
      // consistency audit F2): the same mechanism as the pause toggle, so
      // every tab — table, trend, ledger, forecast — reads the rule as
      // stopped from today. `status` is left untouched, so this never creates
      // a new legacy-style cancelled rule.
      patchMovement(rec.id, pauseRecurringRule(rec, todayLocal()));
      (window as any).showToast?.(
        t("Recurring rule paused", "Pravidelná platba pozastavená", "Ismétlődő tétel szüneteltetve")
      );
      return;
    }

    if (statusNeedsRealAmount(nextStatus)) {
      // Fully paid defaults to the planned figure; a partial payment has no
      // sensible default, so it starts from whatever was already settled.
      const suggested =
        nextStatus === "paid"
          ? rec.amountReal > 0
            ? rec.amountReal
            : rec.amountPlanned
          : rec.amountReal > 0
            ? rec.amountReal
            : 0;
      setStatusPrompt({
        record: rec,
        nextStatus,
        amount: suggested > 0 ? String(suggested) : ""
      });
      return;
    }

    patchMovement(rec.id, { status: nextStatus });
    (window as any).showToast?.(
      t(
        `Status changed to "${movementStatusLabel(nextStatus)}"`,
        `Stav zmenený na „${movementStatusLabel(nextStatus)}“`,
        `Állapot módosítva: „${movementStatusLabel(nextStatus)}”`
      )
    );
  };

  const handleConfirmStatusAmount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusPrompt) return;

    const { record, nextStatus, amount } = statusPrompt;
    const parsed = parseFloat(amount.replace(",", "."));
    if (!isFinite(parsed) || parsed <= 0) {
      alert(
        t(
          "Enter the amount that was actually paid.",
          "Zadajte sumu, ktorá bola skutočne uhradená.",
          "Adja meg a tényleges fizetett összeget."
        )
      );
      statusPromptInputRef.current?.focus();
      return;
    }

    const amountReal = Math.round(parsed * 100) / 100;
    patchMovement(record.id, {
      status: nextStatus,
      amountReal,
      // This is a statement about the charge being *settled*, i.e. the last
      // occurrence on or before today — not a forward-looking price change
      // (see F1 of the derived-numbers audit). Pin the old figure to the
      // charges strictly before the one just settled.
      recurringAmountHistory: recurringAmountHistoryAfterChange(
        record,
        { amountPlanned: record.amountPlanned || 0, amountReal },
        lastRecurringOccurrenceOnOrBefore(record, todayLocal())
      ),
      // A settlement without a date would drop out of every month bucket.
      paidDate: record.paidDate || todayLocal()
    });

    setStatusPrompt(null);
    (window as any).showToast?.(
      nextStatus === "paid"
        ? t(
            `Marked as paid — ${money(amountReal)}`,
            `Označené ako uhradené — ${money(amountReal)}`,
            `Fizetettként jelölve — ${money(amountReal)}`
          )
        : t(
            `Partial payment recorded — ${money(amountReal)}`,
            `Čiastočná úhrada zaznamenaná — ${money(amountReal)}`,
            `Részleges fizetés rögzítve — ${money(amountReal)}`
          )
    );
  };

  // Delete Transaction
  const handleDeleteTransaction = (id: string) => {
    if (!canDelete) return;
    // A movement standing in for one charge of a recurring rule: deleting it
    // hands the day back to the rule, which charges it by its schedule again.
    const target = financialRecords.find((r) => r.id === id);
    const standsIn = target?.recurringSourceId && target.recurringOccurrenceDate ? target : null;
    const question = standsIn
      ? t(
          "Delete this payment? The recurring rule will charge that day by its schedule again.",
          "Naozaj vymazať túto platbu? Pravidelný pohyb bude tento deň opäť účtovať podľa plánu.",
          "Törli ezt a fizetést? Az ismétlődő tétel újra az ütemezés szerint terheli azt a napot."
        )
      : t("Are you sure you want to delete this financial record?", "Naozaj chcete vymazať tento finančný záznam?", "Biztosan törölni szeretné ezt a tételt?");
    if (confirm(question)) {
      setFinancialRecords((prev) =>
        prev
          .filter((r) => r.id !== id)
          .map((r) =>
            standsIn && r.id === standsIn.recurringSourceId
              ? { ...r, recurringSkippedDates: unskipRecurringDate(r, standsIn.recurringOccurrenceDate!) }
              : r
          )
      );
      (window as any).showToast?.(t("Record deleted", "Záznam bol vymazaný", "Tétel törölve"));
    }
  };

  const suggestedRootCatColor = useMemo(
    () => nextCategoryColor(financialCategories.filter((c) => c.type === catTreeType && !c.parentId).map((c) => c.color)),
    [financialCategories, catTreeType]
  );
  const newCatFormColor = newCatColorTouched
    ? newCatColor
    : newCatParentId
      ? inheritedColor(financialCategories, newCatParentId) || suggestedRootCatColor
      : suggestedRootCatColor;

  // Create Category
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    let parentLevel = 1;
    if (newCatParentId) {
      const parent = financialCategories.find((c) => c.id === newCatParentId);
      // A parent from the other side of the ledger (stale selection left over
      // from the Expense/Income switcher, see F1) is treated the same as no
      // parent found at all — the new category is created as a root of its
      // own type instead of silently nesting under the wrong section.
      if (parent && parent.type === catTreeType) {
        parentLevel = parent.level + 1;
      }
    }

    if (parentLevel > 3) {
      alert(t("Maximum category depth is 3 levels.", "Maximálna hĺbka kategórií je 3 úrovne.", "A maximális kategóriamélység 3 szint."));
      return;
    }

    const newCat: FinancialCategory = {
      id: `fc-${catTreeType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: catTreeType,
      name: newCatName.trim(),
      parentId: newCatParentId || null,
      level: parentLevel as 1 | 2 | 3,
      sortOrder: nextCategorySortOrder(financialCategories, catTreeType, newCatParentId || null),
      color: newCatColorTouched ? newCatColor : newCatParentId ? null : suggestedRootCatColor,
      icon: parentLevel === 1 ? "Layers" : parentLevel === 2 ? "Folder" : "Tag",
      createdAt: new Date().toISOString()
    };

    setFinancialCategories((prev) => [...prev, newCat]);
    setNewCatName("");
    setNewCatParentId("");
    setNewCatColorTouched(false);
    (window as any).showToast?.(t("Category added!", "Kategória bola pridaná!", "Kategória hozzáadva!"));
  };

  // Delete Category
  const handleDeleteCategory = (id: string) => {
    if (!canDelete) return;
    if (confirm(t("Delete category and its subcategories?", "Vymazať kategóriu a všetky jej podkategórie?", "Törli a kategóriát és alkategóriáit?"))) {
      // Find all nested child ids recursively
      const toDeleteIds = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        financialCategories.forEach((c) => {
          if (c.parentId && toDeleteIds.has(c.parentId) && !toDeleteIds.has(c.id)) {
            toDeleteIds.add(c.id);
            changed = true;
          }
        });
      }

      setFinancialCategories((prev) => prev.filter((c) => !toDeleteIds.has(c.id)));
      // The movements filed under them stay, now uncategorized, so every tab keeps counting them.
      setFinancialRecords((prev) =>
        prev.some((r) => r.categoryId && toDeleteIds.has(r.categoryId))
          ? prev.map((r) =>
              r.categoryId && toDeleteIds.has(r.categoryId)
                ? { ...r, categoryId: null, categoryPath: null, updatedAt: new Date().toISOString() }
                : r
            )
          : prev
      );
      (window as any).showToast?.(t("Category removed", "Kategória odstránená", "Kategória eltávolítva"));
    }
  };

  const endCategoryDrag = () => {
    setDraggedCategoryId(null);
    setCategoryDropTarget(null);
  };

  const handleCategoryDragStart = (e: React.DragEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id); // Firefox will not start a drag without data
    setDraggedCategoryId(id);
  };

  /**
   * The top quarter of a row drops before it, the bottom quarter after it and
   * the middle inside it. When the row cannot take the dragged category as a
   * child (too deep), the middle falls back to the nearer edge.
   */
  const categoryDropFromPointer = (e: React.DragEvent<HTMLElement>, targetId: string | null): CategoryDropTarget | null => {
    if (!draggedCategoryId) return null;
    let candidates: CategoryDropPosition[] = ["after"];
    if (targetId !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
      const nearerEdge: CategoryDropPosition = ratio < 0.5 ? "before" : "after";
      candidates = ratio < 0.25 ? ["before"] : ratio > 0.75 ? ["after"] : ["inside", nearerEdge];
    }
    for (const position of candidates) {
      const drop = { targetId, position };
      if (resolveCategoryDrop(financialCategories, draggedCategoryId, drop)) return drop;
    }
    return null;
  };

  const handleCategoryDragOver = (e: React.DragEvent<HTMLElement>, targetId: string | null) => {
    if (!draggedCategoryId) return;
    e.stopPropagation();
    const drop = categoryDropFromPointer(e, targetId);
    if (!drop) {
      e.dataTransfer.dropEffect = "none";
      if (categoryDropTarget) setCategoryDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (categoryDropTarget?.targetId !== drop.targetId || categoryDropTarget?.position !== drop.position) {
      setCategoryDropTarget(drop);
    }
  };

  const handleCategoryDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dragId = draggedCategoryId;
    const drop = categoryDropTarget;
    endCategoryDrag();
    if (!dragId || !drop) return;

    const next = moveCategory(financialCategories, dragId, drop);
    if (!next || next === financialCategories) return;
    setFinancialCategories((prev) => moveCategory(prev, dragId, drop) ?? prev);
    (window as any).showToast?.(t("Category moved", "Kategória bola presunutá", "Kategória áthelyezve"));
  };

  const categoryColor = (cat: FinancialCategory | undefined | null): string | null =>
    cat ? categoryColorDrafts[cat.id] ?? cat.color ?? null : null;

  const handleCategoryColorChange = (id: string, color: string) => {
    setCategoryColorDrafts((drafts) => ({ ...drafts, [id]: color }));
    clearTimeout(categoryColorTimers.current[id]);
    categoryColorTimers.current[id] = setTimeout(() => {
      delete categoryColorTimers.current[id];
      setFinancialCategories((prev) => prev.map((c) => (c.id === id && c.color !== color ? { ...c, color } : c)));
      setCategoryColorDrafts((drafts) => {
        const rest = { ...drafts };
        delete rest[id];
        return rest;
      });
    }, 400);
  };

  const CATEGORY_ROW_STYLES = {
    1: {
      row: "p-3.5 bg-slate-50/80 border-b border-slate-100",
      swatch: "h-3.5 w-3.5",
      name: "font-bold text-xs text-slate-900 uppercase tracking-wider",
      badge: "px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600",
      badgeText: "Level 1",
      trash: "h-3.5 w-3.5"
    },
    2: {
      row: "p-2 rounded-xl bg-white border border-slate-100",
      swatch: "h-3 w-3",
      name: "font-semibold text-xs text-slate-800",
      badge: "px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-500",
      badgeText: "Level 2",
      trash: "h-3 w-3"
    },
    3: {
      row: "p-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100 text-xs",
      swatch: "h-2.5 w-2.5",
      name: "text-slate-700 font-medium",
      badge: "text-[10px] text-slate-400",
      badgeText: "(Level 3)",
      trash: "h-3 w-3"
    }
  } as const;

  /** One draggable row of the category tree; `inheritedColor` is shown while the category has none of its own. */
  const renderCategoryRow = (cat: FinancialCategory, level: 1 | 2 | 3, inheritedColor?: string | null) => {
    const styles = CATEGORY_ROW_STYLES[level];
    const drop = draggedCategoryId && categoryDropTarget?.targetId === cat.id ? categoryDropTarget.position : null;
    const shownColor = categoryColor(cat) || inheritedColor || "#6366f1";

    return (
      <div
        key={cat.id}
        draggable
        onDragStart={(e) => handleCategoryDragStart(e, cat.id)}
        onDragEnd={endCategoryDrag}
        onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
        onDrop={handleCategoryDrop}
        title={t("Drag to reorder or move under another category", "Potiahnutím zmeníte poradie alebo nadradenú kategóriu", "Húzza az átrendezéshez vagy áthelyezéshez")}
        className={`group relative flex items-center justify-between cursor-grab active:cursor-grabbing transition-[opacity,background-color,box-shadow] duration-150 ${styles.row} ${
          draggedCategoryId === cat.id ? "opacity-40" : ""
        } ${drop === "inside" ? "ring-2 ring-inset ring-indigo-400 !bg-indigo-50" : ""}`}
      >
        {drop === "before" && (
          <span className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-indigo-500 animate-in fade-in duration-150" />
        )}
        {drop === "after" && (
          <span className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-indigo-500 animate-in fade-in duration-150" />
        )}

        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors duration-150" />
          <ColorPicker
            value={shownColor}
            onChange={(color) => handleCategoryColorChange(cat.id, color)}
            title={t("Change color", "Zmeniť farbu", "Szín módosítása")}
            className={styles.swatch}
          />
          <span className={`truncate ${styles.name}`}>{cat.name}</span>
          <span className={`shrink-0 ${styles.badge}`}>{styles.badgeText}</span>
        </div>
        {canDelete && (
        <button
          onClick={() => handleDeleteCategory(cat.id)}
          className="p-1 text-slate-400 hover:text-rose-600 transition-colors duration-150 cursor-pointer"
          title={t("Delete category", "Vymazať", "Törlés")}
        >
          <Trash2 className={styles.trash} />
        </button>
        )}
      </div>
    );
  };

  // Shared Transaction Form Fields (used in both Slideout Drawer for Edit and Center Popup for Create)
  const renderTransactionFormFields = () => (
    <>
      {/* 1. Type — income or expense */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            switchFormType("income");
            if (!formInvoiceNumber) {
              setFormInvoiceNumber(`FA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
            }
          }}
          className={`h-10 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] ${
            formType === "income" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-800"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          {t("Income / Invoice", "Príjem / Faktúra", "Bevétel / Számla")}
        </button>
        <button
          type="button"
          onClick={() => switchFormType("expense")}
          className={`h-10 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] ${
            formType === "expense" ? "bg-rose-600 text-white shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-800"
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          {t("Expense / Cost", "Výdavok / Náklad", "Kiadás / Költség")}
        </button>
      </div>

      {/* 2. Title & document number */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className={FORM_LABEL}>
            {t("Title *", "Názov *", "Megnevezés *")}
          </label>
          <input
            type="text"
            required
            maxLength={255}
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder={formType === "income" ? t("e.g. Countertop supply & installation", "napr. Dodávka a montáž kuchynskej linky", "pl. Konyhapult szállítása és beépítése") : t("e.g. Material purchase, Office rent...", "napr. Nákup materiálu, Nájom skladu...", "pl. Anyagbeszerzés, Irodabérlet...")}
            className={FORM_INPUT}
          />
        </div>

        <div>
          <label className={FORM_LABEL}>
            {t("Document No.", "Číslo dokladu", "Bizonylatszám")}
          </label>
          <input
            type="text"
            value={formInvoiceNumber}
            onChange={(e) => setFormInvoiceNumber(e.target.value)}
            placeholder="FA-2026-0001"
            className={`${FORM_INPUT} font-mono`}
          />
        </div>
      </div>

      {/* 3. Category */}
      <div>
        <label className={FORM_LABEL}>
          {t("Category", "Kategória", "Kategória")}
        </label>
        <SearchableCategorySelect
          value={formCategoryId}
          onChange={(catId) => setFormCategoryId(catId === "all" ? "" : catId)}
          categories={financialCategories}
          filterType={formType}
          allowAll={false}
          size="md"
          placeholder={t("-- Select Category --", "-- Vyberte kategóriu --", "-- Válasszon kategóriát --")}
          t={t}
        />
      </div>

      {/* 4. Status & dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={FORM_LABEL}>
            {t("Status", "Stav úhrady", "Állapot")}
          </label>
          <CustomSelect
            value={formStatus}
            onChange={(val) => {
              const newSt = val as FinancialStatus;
              if (formIsRecurring && newSt === "cancelled") {
                // "Zrušené" on a recurring row pauses it (option A of Problem
                // B): end date = today, planned end kept, `status` left as-is
                // — the same mechanism `handleInlineStatusChange` and the
                // pause toggle use, so every tab agrees on when it stopped.
                setFormRecurringPlannedEndDate(formRecurringEndDate || null);
                setFormRecurringEndDate(todayLocal());
                return;
              }
              setFormStatus(newSt);
              if (newSt === "paid" && (!formAmountReal || formAmountReal === 0) && formAmountPlanned) {
                setFormAmountReal(formAmountPlanned);
              }
            }}
            options={[
              { value: "planned", label: t("Planned / Scheduled", "Plánované", "Tervezett") },
              { value: "pending", label: t("Pending / Issued", "Čaká na úhradu", "Fizetésre vár") },
              { value: "paid", label: t("Paid / Settled", "Uhradené", "Fizetve") },
              { value: "partially_paid", label: t("Partially Paid", "Čiastočne uhradené", "Részben fizetve") },
              { value: "overdue", label: t("Overdue", "Po splatnosti", "Lejárt") },
              { value: "cancelled", label: t("Cancelled", "Zrušené", "Törölve") },
            ]}
            size="sm"
            className="h-10 !px-3.5 text-xs rounded-xl"
          />
        </div>

        <div>
          <label className={FORM_LABEL}>
            {t("Issue Date *", "Dátum vystavenia *", "Kiállítás dátuma *")}
          </label>
          <input
            type="date"
            required
            value={formIssueDate}
            onChange={(e) => setFormIssueDate(e.target.value)}
            className={FORM_INPUT}
          />
        </div>

        <div>
          <label className={FORM_LABEL}>
            {t("Due Date", "Dátum splatnosti", "Esedékesség")}
          </label>
          <input
            type="date"
            value={formDueDate}
            onChange={(e) => setFormDueDate(e.target.value)}
            className={FORM_INPUT}
          />
        </div>
      </div>

      {/* 5. Amounts — planned vs actually paid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
        <div>
          <label className={`${FORM_LABEL} flex items-baseline justify-between gap-2`}>
            <span>{t("Planned Amount *", "Plánovaná suma *", "Tervezett összeg *")}</span>
            <span className="text-[10px] font-medium text-slate-400">{t("Budget / target", "Rozpočet / cieľ", "Költségvetés")}</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              required
              value={formAmountPlanned}
              onChange={(e) => setFormAmountPlanned(e.target.value ? parseFloat(e.target.value) : "")}
              placeholder="0.00"
              className={`${FORM_INPUT} pr-9 !text-sm font-bold tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">€</span>
          </div>
        </div>

        <div>
          <label className={`${FORM_LABEL} flex items-baseline justify-between gap-2`}>
            <span>{t("Paid Amount", "Skutočná suma", "Fizetett összeg")}</span>
            <span className="text-[10px] font-medium text-slate-400">{t("Actually settled", "Skutočne uhradené", "Ténylegesen fizetve")}</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={formAmountReal}
              onChange={(e) => setFormAmountReal(e.target.value ? parseFloat(e.target.value) : "")}
              placeholder="0.00"
              className={`${FORM_INPUT} pr-9 !text-sm font-bold tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">€</span>
          </div>
        </div>

        {/* A price change on a recurring rule only ever moves forward — say so
            before the user saves, so nobody expects the past to follow. */}
        {(() => {
          if (!editingRecord?.isRecurring || !formIsRecurring) return null;

          // What a charge is worth before and after this edit — the same figure
          // the forecasts price with, so the hint only speaks up when they move.
          const previousAmount = recurringChargeAmount({
            amountPlanned: Number(editingRecord.amountPlanned) || 0,
            amountReal: Number(editingRecord.amountReal) || 0
          });
          const nextPair = {
            amountPlanned: Number(formAmountPlanned) || 0,
            amountReal: Number(formAmountReal) || 0
          };
          const nextAmount = recurringChargeAmount(nextPair);
          const history = editingRecord.recurringAmountHistory || [];
          const appliesFromIso = repriceFrom();
          const lastChargedIso = shiftIsoDate(appliesFromIso, -1);

          const amountMoved = Math.round(nextAmount * 100) !== Math.round(previousAmount * 100);
          if (!amountMoved && history.length === 0) return null;

          // The same call the save makes: it pins nothing when the rule has
          // not charged before the chosen day — that is a correction, and the
          // date only matters once there is a charge to keep at the old price.
          const pinsOldAmount =
            amountMoved &&
            (recurringAmountHistoryAfterChange(editingRecord, nextPair, appliesFromIso)?.length ?? 0) >
              history.length;

          const appliesFrom = formatDateLocalized(appliesFromIso, userLanguage);
          const lastCharged = formatDateLocalized(lastChargedIso, userLanguage);
          const earliest = recurringEarliestRepriceDate(editingRecord);

          return (
            <div className="sm:col-span-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-purple-50  border border-purple-200  text-[11px] text-purple-800 ">
              <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1 flex-1 min-w-0">
                {amountMoved && (
                  <>
                    <p className="font-semibold">
                      {pinsOldAmount
                        ? t(
                            `The new amount applies from ${appliesFrom} — charges up to ${lastCharged} keep ${money(previousAmount)}.`,
                            `Nová suma platí od ${appliesFrom} — platby do ${lastCharged} zostávajú na ${money(previousAmount)}.`,
                            `Az új összeg ${appliesFrom} napjától érvényes — a ${lastCharged} előtti tételek ${money(previousAmount)} maradnak.`
                          )
                        : t(
                            `Nothing has been charged before ${appliesFrom}, so the amount is simply corrected.`,
                            `Pred ${appliesFrom} sa nič neúčtovalo, suma sa iba opraví.`,
                            `${appliesFrom} előtt nem volt terhelés, az összeg egyszerűen javításra kerül.`
                          )}
                    </p>
                    <label className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t("New amount applies from", "Nová suma platí od", "Az új összeg érvényes ettől")}</span>
                      <input
                        type="date"
                        value={appliesFromIso}
                        min={earliest ?? undefined}
                        onChange={(e) => setFormAmountAppliesFrom(e.target.value)}
                        className="h-7 rounded-lg border border-purple-200 bg-white px-2 text-[11px] font-semibold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-300"
                      />
                    </label>
                  </>
                )}
                {history.length > 0 && (
                  <p className="text-purple-600 ">
                    {t("Earlier amounts:", "Skoršie sumy:", "Korábbi összegek:")}{" "}
                    {history
                      .map(
                        (period) =>
                          `${money(recurringChargeAmount(period))} ${t("until", "do", "eddig")} ${formatDateLocalized(period.until, userLanguage)}`
                      )
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 6. Recurring switch — the whole row toggles. Only when creating, or
          editing a rule from the Recurring tab: a stored one-off movement is
          edited as the single movement it is, and one charge of a rule is
          edited through `renderOccurrenceFormFields`. */}
      {(!editingRecord || editingRecord.isRecurring) && (
      <div
        className={`p-4 rounded-2xl border space-y-3 transition-colors duration-200 ${
          formIsRecurring ? "bg-indigo-50/60 border-indigo-200" : "bg-white border-slate-200 hover:border-slate-300"
        }`}
      >
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="flex items-center gap-3 min-w-0">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
                formIsRecurring ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              <RefreshCw className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-800">
                {t("Recurring payment", "Opakujúca sa platba", "Ismétlődő tétel")}
              </span>
              <span className="block text-[11px] text-slate-500">
                {t("Repeats automatically every week, month or year", "Automaticky sa opakuje týždenne, mesačne alebo ročne", "Automatikusan ismétlődik hetente, havonta vagy évente")}
              </span>
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={formIsRecurring}
              onChange={(e) => setFormIsRecurring(e.target.checked)}
              className="sr-only peer"
            />
            <span className="w-9 h-5 bg-slate-200 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40 peer-checked:bg-indigo-600 transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform after:duration-200 peer-checked:after:translate-x-4 peer-checked:after:border-white"></span>
          </span>
        </label>

        {formIsRecurring && (
          <div className="space-y-3 pt-2 border-t border-indigo-100  animate-in fade-in">
            {/* Frequency selector: Weekly / Monthly / Yearly */}
            <div>
              <label className="text-[11px] font-bold text-slate-600  block mb-1">
                {t("Recurrence Frequency", "Periodicita opakovania", "Gyakoriság")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "weekly", label: t("Weekly", "Týždenne", "Heti") },
                  { id: "monthly", label: t("Monthly", "Mesačne", "Havi") },
                  { id: "yearly", label: t("Yearly", "Ročne", "Éves") }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormRecurringFreq(f.id as any)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      formRecurringFreq === f.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white  text-slate-700  border border-slate-200 "
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* WEEKLY: Select Day of Week */}
            {formRecurringFreq === "weekly" && (
              <div className="animate-in fade-in">
                <label className="text-[11px] font-bold text-slate-600  block mb-1">
                  {t("Day of the Week", "Deň v týždni", "A hét napja")}
                </label>
                <CustomSelect
                  value={String(formWeeklyDay)}
                  onChange={(val) => setFormWeeklyDay(parseInt(val))}
                  options={[
                    { value: "1", label: t("Monday", "Pondelok", "Hétfő") },
                    { value: "2", label: t("Tuesday", "Utorok", "Kedd") },
                    { value: "3", label: t("Wednesday", "Streda", "Szerda") },
                    { value: "4", label: t("Thursday", "Štvrtok", "Csütörtök") },
                    { value: "5", label: t("Friday", "Piatok", "Péntek") },
                    { value: "6", label: t("Saturday", "Sobota", "Szombat") },
                    { value: "0", label: t("Sunday", "Nedeľa", "Vasárnap") },
                  ]}
                  size="sm"
                  className="w-full text-xs font-semibold rounded-xl"
                />
              </div>
            )}

            {/* MONTHLY: Specific Day vs Nth Weekday */}
            {formRecurringFreq === "monthly" && (
              <div className="space-y-2 animate-in fade-in">
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="monthlyType"
                      checked={formMonthlyType === "day_of_month"}
                      onChange={() => setFormMonthlyType("day_of_month")}
                    />
                    <span>{t("Specific Day of Month", "Konkrétny deň v mesiaci", "A hónap adott napja")}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="monthlyType"
                      checked={formMonthlyType === "nth_weekday"}
                      onChange={() => setFormMonthlyType("nth_weekday")}
                    />
                    <span>{t("Nth Weekday of Month (e.g. 1st Monday)", "Relatívny deň (napr. 1. pondelok)", "N-edik hétköznap (pl. 1. hétfő)")}</span>
                  </label>
                </div>

                {formMonthlyType === "day_of_month" ? (
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Day of Month (1 - 31)", "Deň v mesiaci (1 - 31)", "Hányadikán (1 - 31)")}</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formDayOfMonth}
                      onChange={(e) => setFormDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 bg-white  border border-slate-200  rounded-xl text-xs font-bold"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Week of Month", "Týždeň v mesiaci", "Hét a hónapban")}</label>
                      <CustomSelect
                        value={String(formWeekOfMonth)}
                        onChange={(val) => setFormWeekOfMonth(parseInt(val))}
                        options={[
                          { value: "1", label: t("1st (First)", "1. (Prvý)", "1. (Első)") },
                          { value: "2", label: t("2nd (Second)", "2. (Druhý)", "2. (Második)") },
                          { value: "3", label: t("3rd (Third)", "3. (Tretí)", "3. (Harmadik)") },
                          { value: "4", label: t("4th (Fourth)", "4. (Štvrtý)", "4. (Negyedik)") },
                          { value: "-1", label: t("Last", "Posledný", "Utolsó") },
                        ]}
                        size="sm"
                        className="w-full text-xs font-semibold rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Weekday", "Deň v týždni", "Hétköznap")}</label>
                      <CustomSelect
                        value={String(formNthDayOfWeek)}
                        onChange={(val) => setFormNthDayOfWeek(parseInt(val))}
                        options={[
                          { value: "1", label: t("Monday", "Pondelok", "Hétfő") },
                          { value: "2", label: t("Tuesday", "Utorok", "Kedd") },
                          { value: "3", label: t("Wednesday", "Streda", "Szerda") },
                          { value: "4", label: t("Thursday", "Štvrtok", "Csütörtök") },
                          { value: "5", label: t("Friday", "Piatok", "Péntek") },
                        ]}
                        size="sm"
                        className="w-full text-xs font-semibold rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* YEARLY: Month & Day */}
            {formRecurringFreq === "yearly" && (
              <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Month of Year", "Mesiac v roku", "Hónap")}</label>
                  <CustomSelect
                    value={String(formYearlyMonth)}
                    onChange={(val) => setFormYearlyMonth(parseInt(val))}
                    options={[
                      "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
                      "Júl", "August", "September", "Október", "November", "December"
                    ].map((mName, idx) => ({
                      value: String(idx + 1),
                      label: mName,
                    }))}
                    size="sm"
                    className="w-full text-xs font-semibold rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Day of Month", "Deň v mesiaci", "Nap")}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formDayOfMonth}
                    onChange={(e) => setFormDayOfMonth(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 bg-white  border border-slate-200  rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* 7. Assignment — company-wide, a project or a client */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <span className="text-xs font-semibold text-slate-600 block">
          {t("Assignment", "Priradenie", "Hozzárendelés")}
        </span>
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/60 rounded-xl text-xs font-semibold">
          {([
            { id: "global", icon: Globe, label: t("Company-wide", "Celá firma", "Teljes cég"), active: "text-emerald-700" },
            { id: "project", icon: Briefcase, label: t("Project", "Projekt", "Projekt"), active: "text-indigo-700" },
            { id: "client", icon: User, label: t("Client", "Klient", "Ügyfél"), active: "text-teal-700" },
          ] as const).map(({ id, icon: Icon, label, active }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFormScope(id)}
              className={`h-9 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                formScope === id ? `bg-white shadow-sm font-bold ${active}` : "text-slate-600 hover:text-slate-800 hover:bg-white/60"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Project Selector if Project Scope */}
        {formScope === "project" && (
          <div className="animate-in fade-in duration-150">
            <label className="text-[11px] font-bold text-slate-500 block mb-1">
              {t("Select Associated Project *", "Vyberte projekt *", "Válasszon projektet *")}
            </label>
            <CustomSelect
              searchable
              value={formProjectId}
              onChange={(val) => setFormProjectId(val)}
              placeholder={t("-- Select Project --", "-- Vyberte projekt --", "-- Válasszon --")}
              options={[
                { value: "", label: t("-- Select Project --", "-- Vyberte projekt --", "-- Válasszon --") },
                ...projects.map((p) => {
                  const lead = leads.find((l) => l.id === p.leadId || l.id === p.clientId);
                  return {
                    value: p.id,
                    label: lead ? (lead.city ? `${lead.name} (${lead.city})` : lead.name) : p.id,
                  };
                }),
              ]}
              size="sm"
              className="h-10 !px-3.5 text-xs rounded-xl"
            />
          </div>
        )}

        {/* Client Selector if Client Scope */}
        {formScope === "client" && (
          <div className="animate-in fade-in duration-150">
            <label className="text-[11px] font-bold text-slate-500 block mb-1">
              {t("Select Associated Client *", "Vyberte klienta *", "Válasszon ügyfelet *")}
            </label>
            <ClientSelect
              leads={leads}
              value={formClientId}
              onChange={(val) => setFormClientId(val)}
              placeholder={t("-- Select Client --", "-- Vyberte klienta --", "-- Válasszon ügyfelet --")}
              noneLabel={t("-- Select Client --", "-- Vyberte klienta --", "-- Válasszon ügyfelet --")}
              size="sm"
              className="h-10 !px-3.5 text-xs rounded-xl"
            />
          </div>
        )}
      </div>

      {/* 8. Note */}
      <div>
        <label className={FORM_LABEL}>
          {t("Note", "Poznámka", "Megjegyzés")}
        </label>
        <textarea
          rows={3}
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder={t("Additional details, contract references, itemized breakdown...", "Podrobnosti o položkách, zmluve, podmienkach...", "További részletek...")}
          className={FORM_TEXTAREA}
        />
      </div>
    </>
  );

  /**
   * The form for one charge of a recurring rule (see `handleOpenOccurrenceModal`):
   * the day, the amounts, the status, a document number and a note. Title,
   * category, scope and schedule belong to the rule and are only shown.
   */
  const renderOccurrenceFormFields = () => {
    if (!editingOccurrence) return null;
    const { rule, date } = editingOccurrence;
    const crumbs = getCategoryBreadcrumbs(rule.categoryId);
    const scheduledAmount = recurringPlannedAmountAt(rule, date);
    return (
      <>
        {/* 1. What this payment belongs to — read-only, edited on the Recurring tab */}
        <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2" data-occurrence-source="true">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <RefreshCw className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-800 truncate" title={rule.title}>
                {rule.title}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {crumbs.length > 0
                  ? crumbs.map((c) => c.name).join(" › ")
                  : t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
                {" · "}
                {getRecurrenceDescription(rule)}
              </div>
              <div className="text-[11px] text-indigo-700 mt-1">
                {t(
                  `Scheduled for ${formatDateLocalized(date, userLanguage)} at ${money(scheduledAmount)}. Only this payment changes here — the rule stays as it is.`,
                  `Naplánované na ${formatDateLocalized(date, userLanguage)} vo výške ${money(scheduledAmount)}. Tu sa mení iba táto platba — pravidlo zostáva bez zmeny.`,
                  `Ütemezve: ${formatDateLocalized(date, userLanguage)}, ${money(scheduledAmount)}. Itt csak ez a fizetés változik — a szabály változatlan marad.`
                )}
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleOpenEditModal(rule)}
                className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                title={t("Edit the rule itself: title, category, amount, schedule", "Upraviť samotné pravidlo: názov, kategóriu, sumu, plán", "A szabály szerkesztése: név, kategória, összeg, ütemezés")}
              >
                {t("Edit rule", "Upraviť pravidlo", "Szabály")}
              </button>
            )}
          </div>
        </div>

        {/* 2. Status & the day of the payment */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={FORM_LABEL}>{t("Status", "Stav úhrady", "Állapot")}</label>
            <CustomSelect
              value={formStatus}
              onChange={(val) => {
                const newSt = val as FinancialStatus;
                setFormStatus(newSt);
                if (newSt === "paid" && (!formAmountReal || formAmountReal === 0) && formAmountPlanned) {
                  setFormAmountReal(formAmountPlanned);
                }
              }}
              options={[
                { value: "planned", label: t("Planned / Scheduled", "Plánované", "Tervezett") },
                { value: "pending", label: t("Pending / Issued", "Čaká na úhradu", "Fizetésre vár") },
                { value: "paid", label: t("Paid / Settled", "Uhradené", "Fizetve") },
                { value: "partially_paid", label: t("Partially Paid", "Čiastočne uhradené", "Részben fizetve") },
                { value: "overdue", label: t("Overdue", "Po splatnosti", "Lejárt") },
                { value: "cancelled", label: t("Cancelled", "Zrušené", "Törölve") }
              ]}
              size="sm"
              className="h-10 !px-3.5 text-xs rounded-xl"
            />
          </div>

          <div>
            <label className={FORM_LABEL}>{t("Payment date *", "Dátum platby *", "Fizetés napja *")}</label>
            <input
              type="date"
              required
              value={formIssueDate}
              onChange={(e) => setFormIssueDate(e.target.value)}
              className={FORM_INPUT}
            />
          </div>

          <div>
            <label className={FORM_LABEL}>{t("Due Date", "Dátum splatnosti", "Esedékesség")}</label>
            <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} className={FORM_INPUT} />
          </div>
        </div>

        {/* 3. Amounts — this payment only */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div>
            <label className={`${FORM_LABEL} flex items-baseline justify-between gap-2`}>
              <span>{t("Planned Amount *", "Plánovaná suma *", "Tervezett összeg *")}</span>
              <span className="text-[10px] font-medium text-slate-400">{t("This payment", "Táto platba", "Ez a fizetés")}</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                required
                value={formAmountPlanned}
                onChange={(e) => setFormAmountPlanned(e.target.value ? parseFloat(e.target.value) : "")}
                placeholder="0.00"
                className={`${FORM_INPUT} pr-9 !text-sm font-bold tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">€</span>
            </div>
          </div>

          <div>
            <label className={`${FORM_LABEL} flex items-baseline justify-between gap-2`}>
              <span>{t("Paid Amount", "Skutočná suma", "Fizetett összeg")}</span>
              <span className="text-[10px] font-medium text-slate-400">{t("Actually settled", "Skutočne uhradené", "Ténylegesen fizetve")}</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={formAmountReal}
                onChange={(e) => setFormAmountReal(e.target.value ? parseFloat(e.target.value) : "")}
                placeholder="0.00"
                className={`${FORM_INPUT} pr-9 !text-sm font-bold tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">€</span>
            </div>
          </div>
        </div>

        {/* 4. Document number & note */}
        <div>
          <label className={FORM_LABEL}>{t("Document No.", "Číslo dokladu", "Bizonylatszám")}</label>
          <input
            type="text"
            value={formInvoiceNumber}
            onChange={(e) => setFormInvoiceNumber(e.target.value)}
            placeholder="FA-2026-0001"
            className={`${FORM_INPUT} font-mono`}
          />
        </div>
        <div>
          <label className={FORM_LABEL}>{t("Note", "Poznámka", "Megjegyzés")}</label>
          <textarea
            rows={3}
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder={t("Why this payment differs from the rule...", "Prečo sa táto platba líši od pravidla...", "Miért tér el ez a fizetés a szabálytól...")}
            className={FORM_TEXTAREA}
          />
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* 1. TOP HEADER & COMMAND BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4 select-none">
        <div className="flex flex-col min-w-0">
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-emerald-600" />
            {t("Financial Management & Revenue Control", "Finančný manažment a riadenie výnosov", "Pénzügyi menedzsment és bevételkezelés")}
          </h2>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {t("Track planned vs real cash flows, project revenue profitability, single & recurring expenses, and 3-level categories.", "Sledovanie plánovaných a reálnych tokov, ziskovosti projektov, jednorazových a pravidelných výdavkov a 3 úrovní kategórií.", "Tervezett és valós pénzáramlások, projektjövedelmezőség, rendszeres kiadások és 3 szintű kategóriák.")}
          </p>
          {!canEdit && (
            <span className="mt-2 inline-flex items-center w-fit px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase tracking-wider">
              {t("Read-only access", "Iba na čítanie", "Csak olvasható")}
            </span>
          )}
        </div>

        {/* Quick Actions — one row, equal height, never wrapping into a stack */}
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
          <button
            onClick={() => handleOpenCreateModal("income", "global")}
            className="flex items-center justify-center gap-2 h-10 px-4 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm shadow-emerald-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>{t("New Income / Invoice", "Nový príjem / Faktúra", "Új bevétel / Számla")}</span>
          </button>
          )}

          {canEdit && (
          <button
            onClick={() => handleOpenCreateModal("expense", "global")}
            className="flex items-center justify-center gap-2 h-10 px-4 whitespace-nowrap bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-sm shadow-rose-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>{t("New Expense", "Nový výdavok", "Új kiadás")}</span>
          </button>
          )}
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex border-b border-slate-200  overflow-x-auto scrollbar-none gap-2" role="tablist">
        {[
          { id: "overview", label: t("📊 Global Overview & Trend", "📊 Globálny prehľad & Trend", "📊 Globális áttekintés & Trend") },
          { id: "table", label: t("📋 Overview Table", "📋 Prehľadová tabuľka", "📋 Áttekintő táblázat") },
          { id: "movements", label: t("💸 Movements", "💸 Pohyby", "💸 Mozgások") },
          { id: "recurring", label: t("🔄 Recurring Expenses", "🔄 Pravidelné výdavky", "🔄 Rendszeres kiadások") },
          { id: "categories", label: t("🏷️ Movement Categories", "🏷️ Kategórie pohybov", "🏷️ Mozgási kategóriák") }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? "border-emerald-500 text-emerald-600  bg-emerald-50/50  rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-700 "
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. TAB CONTENT 1: GLOBAL OVERVIEW (FOCUSED HYBRID TREND & FORWARD PROJECTION) */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* HYBRID WEEKLY TREND & FORWARD PROJECTION CHART (3 / 6 / 12 months) */}
          <div className="bg-white  p-6 rounded-3xl border border-slate-200/80  shadow-sm space-y-6">
            {/* 1. Header with Mode Toggle & Bank Balance Calibrators */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4 border-b border-slate-100 ">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900  flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-500" />
                    {trendMode === "cumulative"
                      ? t(
                          `Weekly Trend & ${projectionMonths}-Month Projection (Cumulative Bank Balance)`,
                          `Týždenný vývoj a ${projectionMonths}-mesačná prognóza (Kumulatívny stav na účte)`,
                          `Heti trend és ${projectionMonths} hónapos előrejelzés (Kumulált bankszámla egyenleg)`
                        )
                      : t(
                          `Weekly Trend & ${projectionMonths}-Month Projection (Relative Cash Flow)`,
                          `Týždenný vývoj a ${projectionMonths}-mesačná prognóza (Relatívny cash flow)`,
                          `Heti trend és ${projectionMonths} hónapos előrejelzés (Relatív pénzáramlás)`
                        )}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    trendMode === "cumulative" 
                      ? "bg-emerald-100  text-emerald-700  border border-emerald-200 " 
                      : "bg-purple-100  text-purple-700  border border-purple-200 "
                  }`}>
                    {trendMode === "cumulative" ? t("🏦 Cumulative Funds", "🏦 Kumulatívny stav", "🏦 Kumulált egyenleg") : t("📊 Relative Cash Flow", "📊 Relatívny tok", "📊 Relatív folyam")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 ">
                  {trendMode === "cumulative"
                    ? t(
                        `Bars display weekly income & expense. The continuous plotline projects running Bank Account Balance (cumulative cash reserves) forward for the next ${projectionMonths} months. Click any week to calibrate its balance independently.`,
                        `Stĺpce zobrazujú týždenné príjmy a výdavky. Spojitá krivka zobrazuje projektovaný stav na bankovom účte na ${skNextMonths(projectionMonths)}. Kliknutím na ľubovoľný týždeň môžete nezávisle nastaviť jeho zostatok.`,
                        `Az oszlopok a heti bevételeket és kiadásokat mutatják. A folytonos vonal a következő ${projectionMonths} hónap várható bankszámla egyenlegét jelzi. Kattintson bármelyik hétre az egyenleg független beállításához.`
                      )
                    : t(
                        "Bars display cumulative weekly income & expense. The continuous plotline traces weekly net difference and future projected revenue (projected income − projected expense).",
                        "Stĺpce zobrazujú týždenné kumulatívne príjmy a výdavky. Spojitá krivka zobrazuje čistý rozdiel a budúce projektované tržby po odpočítaní výdavkov.",
                        "Az oszlopok a heti kumulált bevételeket és kiadásokat mutatják. A folytonos vonal a heti nettó különbözetet és a jövőbeli tervezett nyereséget jelzi."
                      )}
                </p>
              </div>

              {/* Controls: Mode Switcher Pill */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Mode Switcher Pill */}
                <div className="bg-slate-100  p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80 ">
                  <button
                    type="button"
                    onClick={() => handleSetTrendMode("relative")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      trendMode === "relative"
                        ? "bg-white  text-purple-600  shadow-sm border border-slate-200/80 "
                        : "text-slate-600  hover:text-slate-900 "
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>{t("Relative Flow", "Relatívny tok", "Relatív folyam")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetTrendMode("cumulative")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      trendMode === "cumulative"
                        ? "bg-white  text-emerald-600  shadow-sm border border-slate-200/80 "
                        : "text-slate-600  hover:text-slate-900 "
                    }`}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                    <span>{t("Cumulative Balance", "Stav na účte (Kumulatívny)", "Bankszámla egyenleg")}</span>
                  </button>
                </div>

                {/* Forecast Horizon Pill: how far forward the projection runs */}
                <div className="bg-slate-100  p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80 ">
                  <span className="pl-2 pr-1 text-[10px] font-black uppercase tracking-wider text-slate-400  flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t("Horizon", "Horizont", "Időtáv")}
                  </span>
                  {PROJECTION_HORIZONS.map((h) => (
                    <button
                      key={h.months}
                      type="button"
                      onClick={() => handleSetProjectionMonths(h.months)}
                      title={t(
                        `Project ${h.months} months forward (${h.futureWeeks} future weeks)`,
                        `Prognóza na ${skMonths(h.months)} dopredu (${h.futureWeeks} budúcich týždňov)`,
                        `Előrejelzés ${h.months} hónapra előre (${h.futureWeeks} jövőbeli hét)`
                      )}
                      aria-pressed={projectionMonths === h.months}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        projectionMonths === h.months
                          ? "bg-white  text-indigo-600  shadow-sm border border-slate-200/80 "
                          : "text-slate-600  hover:text-slate-900 "
                      }`}
                    >
                      {t(`${h.months}M`, `${h.months}M`, `${h.months}H`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Chart Legend Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50  text-emerald-700  rounded-lg border border-emerald-200 ">
                  <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                  <span>{t("Income (Bar)", "Príjmy (Stĺpec)", "Bevétel (Oszlop)")}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50  text-rose-700  rounded-lg border border-rose-200 ">
                  <span className="h-3 w-3 rounded-sm bg-rose-500" />
                  <span>{t("Expense (Bar)", "Výdavky (Stĺpec)", "Kiadás (Oszlop)")}</span>
                </div>
                {trendMode === "cumulative" ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50  text-emerald-700  rounded-lg border border-emerald-200  shadow-sm">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-300 " />
                    <span>{t("🏦 Total Available Bank Funds (Plotline)", "🏦 Zostatok na účte / Disponibilné financie (Krivka)", "🏦 Bankszámla egyenleg (Vonal)")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50  text-purple-700  rounded-lg border border-purple-200  shadow-sm">
                    <span className="h-3 w-3 rounded-full bg-purple-600 ring-2 ring-purple-300 " />
                    <span>{t("Weekly Net Difference / Flow (Plotline)", "Týždenný čistý zisk / Tok (Krivka)", "Heti nettó különbözet (Vonal)")}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50  text-amber-700  rounded-lg border border-amber-200 ">
                  <Target className="h-3.5 w-3.5 text-amber-500" />
                  <span>{t("🎯 Reconciled Weekly Anchor", "🎯 Manuálne overený stav", "🎯 Manuálisan rögzített hét")}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100  text-slate-600  rounded-lg border border-slate-200 ">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-ping" />
                  <span>{t(`Future ${projectionMonths}-Mo Window`, `${projectionMonths}-Mesačné okno`, `${projectionMonths} Hónapos ablak`)}</span>
                </div>
              </div>

              {/* Quick interactive hint */}
              <span className="text-[10px] text-slate-400 italic">
                {t("💡 Click on any week column or node to calibrate its bank balance independently", "💡 Kliknutím na stĺpec alebo bod ľubovoľného týždňa nastavíte jeho zostatok na účte", "💡 Kattintson bármelyik hét oszlopára vagy pontjára a heti egyenleg beállításához")}
              </span>
            </div>

            {/* 3. Interactive SVG Hybrid Visualization */}
            {(() => {
              const N = weeklyTrendData.length;
              if (N === 0) return null;

              const svgHeight = 360;
              const startX = 65;
              const topY = 45;
              const graphHeight = 245;
              const bottomY = topY + graphHeight;

              // Every week gets a fixed slice of the drawing area, so bars and labels
              // stay the same size whatever the horizon: a longer forecast widens the
              // chart and scrolls rather than squeezing 57 weeks onto one screen.
              // Past three months the slice narrows a little to keep that scrolling
              // tolerable. (18 weeks x 50 reproduces the original 905-unit graph.)
              const weekUnits = N <= 20 ? 50 : N <= 36 ? 34 : 26;
              const graphWidth = N * weekUnits;
              const svgWidth = startX + graphWidth + 30;
              const stepX = weekUnits;
              const barWidth = Math.max(3, Math.min(15, (stepX - 8) / 2));

              // Never render a user unit below a pixel; anything wider than the card
              // scrolls horizontally instead of shrinking.
              const minChartWidth = svgWidth;

              // At the narrowest slice the week labels would touch, so every other
              // one is drawn -- counted out from the current week, so "today" is
              // always labelled and never crowds its neighbour -- and the date line
              // underneath is dropped.
              const labelStride = weekUnits >= 34 ? 1 : 2;
              const showDateSubLabel = weekUnits >= 34;

              // Target value based on active mode
              const getPlotTarget = (b: typeof weeklyTrendData[0]) => trendMode === "cumulative" ? b.cumulativeBalance : b.netDifference;

              // Calculate range & scale
              const maxVal = Math.max(1000, ...weeklyTrendData.map((b) => Math.max(b.totalIncome, b.totalExpense, getPlotTarget(b))));
              const minVal = Math.min(0, ...weeklyTrendData.map((b) => Math.min(0, getPlotTarget(b))));
              const valSpan = (maxVal - minVal) * 1.15 || 1000;
              const scaledMax = maxVal + valSpan * 0.08;
              const scaledMin = minVal - valSpan * 0.07;
              const totalRange = scaledMax - scaledMin;

              const getY = (val: number) => topY + ((scaledMax - val) / totalRange) * graphHeight;
              const zeroY = getY(0);

              // Calculate points for the active plotline
              const points = weeklyTrendData.map((b, idx) => {
                const cx = startX + idx * stepX + stepX / 2;
                const cy = getY(getPlotTarget(b));
                return { x: cx, y: cy, bucket: b, index: idx, value: getPlotTarget(b) };
              });

              // Index of current week
              const currentWeekIdx = weeklyTrendData.findIndex((b) => b.isCurrent);
              const futureStartX = currentWeekIdx >= 0 ? startX + currentWeekIdx * stepX : startX + 4 * stepX;

              // Hovered bucket details
              const activeHoveredBucket = hoveredWeekIdx !== null ? weeklyTrendData[hoveredWeekIdx] : null;

              return (
                <div className="relative select-none">
                  <div className="w-full overflow-x-auto scrollbar-none">
                    <svg
                      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                      style={{ minWidth: `${minChartWidth}px` }}
                      className="w-full h-auto font-sans"
                    >
                      <defs>
                        {/* Gradient for future projection window */}
                        <linearGradient id="futureZoneGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.05" />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.12" />
                        </linearGradient>
                        {/* Gradient for Relative Net Difference Plotline */}
                        <linearGradient id="netLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="50%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                        {/* Gradient for Cumulative Bank Balance Plotline */}
                        <linearGradient id="cumulativeLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="50%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                        {/* Gradient for Cumulative Area Fill */}
                        <linearGradient id="cumulativeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
                          <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.12" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
                        </linearGradient>
                        {/* Gradient for Income bars */}
                        <linearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        {/* Gradient for Expense bars */}
                        <linearGradient id="expenseBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#e11d48" />
                        </linearGradient>
                        {/* Future hatched pattern for projected income */}
                        <pattern id="projectedIncomePat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <rect width="6" height="6" fill="#10b981" />
                          <line x1="0" y1="0" x2="0" y2="6" stroke="#047857" strokeWidth="2.5" />
                        </pattern>
                        {/* Future hatched pattern for projected expense */}
                        <pattern id="projectedExpensePat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <rect width="6" height="6" fill="#f43f5e" />
                          <line x1="0" y1="0" x2="0" y2="6" stroke="#be123c" strokeWidth="2.5" />
                        </pattern>
                        {/* Drop shadow for plotline */}
                        <filter id="plotShadow" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#7c3aed" floodOpacity="0.3" />
                        </filter>
                      </defs>

                      {/* 1. Future 3-Month Projection Window Background Area */}
                      <rect
                        x={futureStartX}
                        y={topY}
                        width={svgWidth - startX - (futureStartX - startX) - 20}
                        height={graphHeight}
                        fill="url(#futureZoneGrad)"
                        rx="16"
                      />

                      {/* 2. Today / Present Vertical Divider Line */}
                      <line
                        x1={futureStartX}
                        y1={topY - 15}
                        x2={futureStartX}
                        y2={bottomY}
                        stroke="#6366f1"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                      {/* Label for Future Window */}
                      <g transform={`translate(${futureStartX + 12}, ${topY - 8})`}>
                        <rect x="0" y="-14" width="200" height="22" rx="11" fill="#6366f1" fillOpacity="0.15" stroke="#6366f1" strokeWidth="1" />
                        <text x="100" y="1" textAnchor="middle" fill="#6366f1" fontSize="10" fontWeight="900" letterSpacing="0.05em">
                          {t(`🔮 ${projectionMonths}-MONTH FUTURE FORECAST`, `🔮 ${projectionMonths}-MESAČNÁ PROGNÓZA`, `🔮 ${projectionMonths} HÓNAPOS ELŐREJELZÉS`)}
                        </text>
                      </g>

                      {/* 3. Horizontal Gridlines & Y-Axis Scale */}
                      {[1, 0.75, 0.5, 0.25, 0, -0.25].map((fraction) => {
                        const val = minVal + (maxVal - minVal) * fraction;
                        const y = getY(val);
                        if (y < topY - 10 || y > bottomY + 10) return null;
                        const isZero = Math.abs(val) < 50;

                        return (
                          <g key={fraction}>
                            <line
                              x1={startX}
                              y1={y}
                              x2={svgWidth - 30}
                              y2={y}
                              stroke={isZero ? "#64748b" : "#cbd5e1"}
                              strokeWidth={isZero ? "1.5" : "0.75"}
                              strokeDasharray={isZero ? "none" : "3 3"}
                              strokeOpacity={isZero ? 0.7 : 0.3}
                            />
                            <text
                              x={startX - 10}
                              y={y + 4}
                              textAnchor="end"
                              className="fill-slate-400  font-bold"
                              fontSize="9"
                            >
                              {val >= 0 ? `+${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : `${(val / 1000).toFixed(val <= -10000 ? 0 : 1)}k`} €
                            </text>
                          </g>
                        );
                      })}

                      {/* 4. Weekly Bar Groups (Income & Expense Columns) */}
                      {weeklyTrendData.map((b, idx) => {
                        const cx = startX + idx * stepX + stepX / 2;
                        const isHovered = hoveredWeekIdx === idx;

                        // Income bar geometry
                        const incTop = getY(b.totalIncome);
                        const incHeight = Math.max(1, zeroY - incTop);

                        // Expense bar geometry
                        const expTop = getY(b.totalExpense);
                        const expHeight = Math.max(1, zeroY - expTop);

                        return (
                          <g
                            key={b.weekLabel + idx}
                            className="cursor-pointer transition-all"
                            onMouseEnter={() => setHoveredWeekIdx(idx)}
                            onMouseLeave={() => setHoveredWeekIdx(null)}
                            onClick={() => handleOpenCalibrator(b)}
                          >
                            {/* Transparent hover hit-box */}
                            <rect
                              x={startX + idx * stepX}
                              y={topY}
                              width={stepX}
                              height={graphHeight + 50}
                              fill={isHovered ? "rgba(99, 102, 241, 0.08)" : "transparent"}
                              rx="8"
                            />

                            {/* Income Bar (Left) */}
                            {b.totalIncome > 0 && (
                              <rect
                                x={cx - barWidth - 1.5}
                                y={incTop}
                                width={barWidth}
                                height={incHeight}
                                fill={b.isFuture ? "url(#projectedIncomePat)" : "url(#incomeBarGrad)"}
                                rx="4"
                                opacity={hoveredWeekIdx === null || isHovered ? 1 : 0.45}
                                className="transition-all duration-200"
                              />
                            )}

                            {/* Expense Bar (Right) */}
                            {b.totalExpense > 0 && (
                              <rect
                                x={cx + 1.5}
                                y={expTop}
                                width={barWidth}
                                height={expHeight}
                                fill={b.isFuture ? "url(#projectedExpensePat)" : "url(#expenseBarGrad)"}
                                rx="4"
                                opacity={hoveredWeekIdx === null || isHovered ? 1 : 0.45}
                                className="transition-all duration-200"
                              />
                            )}

                            {/* Reconciled Anchor Marker above week */}
                            {b.isManuallyCalibrated && (
                              <g transform={`translate(${cx}, ${topY + 6})`}>
                                <circle r="5" fill="#f59e0b" />
                                {isHovered && (
                                  <circle
                                    r="8"
                                    fill="#f59e0b"
                                    fillOpacity="0.3"
                                    style={{ transformOrigin: "center", transformBox: "fill-box" }}
                                    className="animate-ping"
                                  />
                                )}
                                <text y="3" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">✓</text>
                              </g>
                            )}

                            {/* X-Axis Week Labels */}
                            {(idx - currentWeekIdx) % labelStride === 0 && (
                              <>
                                <text
                                  x={cx}
                                  y={bottomY + 15}
                                  textAnchor="middle"
                                  className={`text-[9px] font-black uppercase ${
                                    b.isCurrent
                                      ? "fill-indigo-600  font-extrabold"
                                      : b.isFuture
                                      ? "fill-purple-600 "
                                      : "fill-slate-600 "
                                  }`}
                                >
                                  {b.weekLabel}
                                </text>
                                {showDateSubLabel && (
                                  <text
                                    x={cx}
                                    y={bottomY + 27}
                                    textAnchor="middle"
                                    className={`text-[8px] font-medium ${
                                      b.isCurrent ? "fill-indigo-600 font-bold" : "fill-slate-400"
                                    }`}
                                  >
                                    {b.dateRangeLabel.split(" - ")[0]}
                                  </text>
                                )}
                              </>
                            )}

                            {/* Current week highlight badge pill */}
                            {b.isCurrent && (
                              <g transform={`translate(${cx}, ${bottomY + 41})`}>
                                <rect
                                  x="-19"
                                  y="-7"
                                  width="38"
                                  height="14"
                                  rx="7"
                                  fill="#6366f1"
                                />
                                <text
                                  y="3.5"
                                  textAnchor="middle"
                                  fill="#ffffff"
                                  fontSize="7.5"
                                  fontWeight="900"
                                  letterSpacing="0.04em"
                                >
                                  {t("TODAY", "DNES", "MA")}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {/* 5. In Cumulative Mode: Soft Area Fill under Plotline */}
                      {trendMode === "cumulative" && (
                        <path
                          d={generateAreaPath(points, bottomY)}
                          fill="url(#cumulativeAreaGrad)"
                          className="transition-all duration-300"
                        />
                      )}

                      {/* 6. Smooth Plotline (Relative Net Diff OR Cumulative Bank Balance) */}
                      <path
                        d={generateSmoothPath(points)}
                        fill="none"
                        stroke={trendMode === "cumulative" ? "url(#cumulativeLineGrad)" : "url(#netLineGrad)"}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#plotShadow)"
                      />

                      {/* 7. Dots / Glowing Nodes on Plotline */}
                      {points.map((pt) => {
                        const isHovered = hoveredWeekIdx === pt.index;
                        const isPositive = pt.value >= 0;

                        return (
                          <g
                            key={"pt-" + pt.index}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredWeekIdx(pt.index)}
                            onMouseLeave={() => setHoveredWeekIdx(null)}
                            onClick={() => handleOpenCalibrator(pt.bucket)}
                          >
                            {/* Outer pulsing ring on hover with proper SVG transform origin */}
                            {isHovered && (
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={pt.bucket.isManuallyCalibrated ? 10 : 12}
                                fill={pt.bucket.isManuallyCalibrated ? "#f59e0b" : isPositive ? "#10b981" : "#f43f5e"}
                                fillOpacity="0.3"
                                style={{ transformOrigin: "center", transformBox: "fill-box" }}
                                className="animate-ping"
                              />
                            )}

                            {/* Static ring indicator for manually calibrated weeks when not hovered */}
                            {pt.bucket.isManuallyCalibrated && !isHovered && (
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={9}
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="1.5"
                                strokeDasharray="2 2"
                                opacity="0.75"
                              />
                            )}

                            {/* Node Dot */}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isHovered ? 7 : pt.bucket.isManuallyCalibrated ? 6 : 4}
                              fill={pt.bucket.isManuallyCalibrated ? "#f59e0b" : isPositive ? "#10b981" : "#f43f5e"}
                              stroke="#ffffff"
                              strokeWidth={pt.bucket.isManuallyCalibrated ? "2.5" : "2"}
                              className="transition-all duration-150"
                            />
                          </g>
                        );
                      })}

                      {/* Hover guideline */}
                      {hoveredWeekIdx !== null && points[hoveredWeekIdx] && (
                        <line
                          x1={points[hoveredWeekIdx].x}
                          y1={topY}
                          x2={points[hoveredWeekIdx].x}
                          y2={bottomY}
                          stroke="#8b5cf6"
                          strokeWidth="1.5"
                          strokeDasharray="2 2"
                        />
                      )}
                    </svg>
                  </div>

                  {/* Dynamic Hover Tooltip Card with Week-Specific Calibrator Action */}
                  {activeHoveredBucket && (
                    <div className="mt-3 p-4 rounded-2xl bg-white text-slate-900 shadow-xl border border-slate-200/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            activeHoveredBucket.isCurrent
                              ? "bg-indigo-500 text-white"
                              : activeHoveredBucket.isFuture
                              ? "bg-purple-100 text-purple-700 border border-purple-200"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {activeHoveredBucket.weekLabel} • {activeHoveredBucket.dateRangeLabel} ({activeHoveredBucket.year})
                          </span>
                          <span className="text-xs text-slate-500 font-semibold">
                            {activeHoveredBucket.isCurrent
                              ? t("Current Week (Reference)", "Aktuálny týždeň (Referenčný)", "Aktuális hét (Referencia)")
                              : activeHoveredBucket.isFuture
                              ? t("🔮 Future Projected Week", "🔮 Budúci projektovaný týždeň", "🔮 Jövőbeli tervezett hét")
                              : t("Historical Week", "História", "Múltbéli hét")}
                          </span>
                          {activeHoveredBucket.isManuallyCalibrated && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold flex items-center gap-1">
                              <Target className="h-3 w-3" />
                              {t("Reconciled Anchor", "Ručne overený stav", "Rögzített állapot")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {activeHoveredBucket.items.length}{" "}
                          {t("financial movement(s) in this week", "finančných pohybov v tomto týždni", "pénzügyi tétel ezen a héten")}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        {/* Income */}
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Total Income", "Príjmy spolu", "Összes bevétel")}</span>
                          <div className="text-sm font-black text-emerald-600">
                            +{money(activeHoveredBucket.totalIncome)}
                          </div>
                        </div>

                        {/* Expense */}
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Total Expense", "Výdavky spolu", "Összes kiadás")}</span>
                          <div className="text-sm font-black text-rose-600">
                            -{money(activeHoveredBucket.totalExpense)}
                          </div>
                        </div>

                        {/* Weekly Net Difference */}
                        <div className="space-y-0.5 pl-3 border-l border-slate-200">
                          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">
                            {activeHoveredBucket.isFuture ? t("Weekly Net Rev", "Týždenný zisk", "Heti nettó") : t("Weekly Net", "Týždenná zmena", "Heti egyenleg")}
                          </span>
                          <div className={`text-sm font-black ${activeHoveredBucket.netDifference >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {activeHoveredBucket.netDifference >= 0 ? "+" : ""}{money(activeHoveredBucket.netDifference)}
                          </div>
                        </div>

                        {/* Cumulative Bank Account Balance + Inline Calibrate Trigger */}
                        <div className="space-y-0.5 pl-3 border-l border-slate-200 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-3">
                          <div>
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                              <Landmark className="h-3 w-3" />
                              {t("Bank Balance on Account", "Stav na účte", "Bankszámla egyenleg")}
                            </span>
                            <div className={`text-base font-black ${activeHoveredBucket.cumulativeBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {money(activeHoveredBucket.cumulativeBalance)}
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleOpenCalibrator(activeHoveredBucket)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                            title={t(`Calibrate Bank Balance for ${activeHoveredBucket.weekLabel}`, `Nastaviť zostatok pre ${activeHoveredBucket.weekLabel}`, `Egyenleg beállítása: ${activeHoveredBucket.weekLabel}`)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expand / Collapse Weekly Data Breakdown Table */}
                  <div className="mt-4 pt-2 border-t border-slate-100  flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setIsWeeklyTableOpen(!isWeeklyTableOpen)}
                      className="flex items-center gap-2 text-xs font-bold text-indigo-600  hover:text-indigo-700 cursor-pointer"
                    >
                      <CalendarDays className="h-4 w-4" />
                      {isWeeklyTableOpen
                        ? t(
                            `Hide ${projectionTotalWeeks}-Week Projection Table`,
                            `Skryť ${projectionTotalWeeks}-týždňovú tabuľku prognózy`,
                            `${projectionTotalWeeks} hetes előrejelzési táblázat elrejtése`
                          )
                        : t(
                            `Inspect Full ${projectionTotalWeeks}-Week Weekly Breakdown (${TREND_PAST_WEEKS} Past + ${projectionFutureWeeks} Future Weeks)`,
                            `Zobraziť podrobnú ${projectionTotalWeeks}-týždňovú tabuľku (${TREND_PAST_WEEKS} minulé + ${projectionFutureWeeks} budúcich týždňov)`,
                            `Részletes ${projectionTotalWeeks} hetes lebontás megtekintése (${TREND_PAST_WEEKS} múltbéli + ${projectionFutureWeeks} jövőbeli hét)`
                          )}
                      {isWeeklyTableOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <span className="text-[11px] text-slate-400">
                      {t(
                        `Total Horizon: ${projectionTotalWeeks} Weeks (${projectionMonths} Months Forward)`,
                        `Časový horizont: ${projectionTotalWeeks} týždňov (${skMonths(projectionMonths)} dopredu)`,
                        `Teljes időtáv: ${projectionTotalWeeks} hét (${projectionMonths} hónap előre)`
                      )}
                    </span>
                  </div>

                  {/* Weekly Data Table (4 past weeks + the selected forecast horizon) */}
                  {isWeeklyTableOpen && (
                    <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200  animate-in fade-in duration-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50  text-[10px] font-black uppercase tracking-wider text-slate-500  border-b border-slate-200 ">
                          <tr>
                            <th className="py-3 px-4">{t("Week / Period", "Týždeň / Obdobie", "Hét / Időszak")}</th>
                            <th className="py-3 px-4">{t("Type", "Typ", "Típus")}</th>
                            <th className="py-3 px-4 text-right">{t("Cumulative Income", "Príjmy", "Bevételek")}</th>
                            <th className="py-3 px-4 text-right">{t("Cumulative Expense", "Výdavky", "Kiadások")}</th>
                            <th className="py-3 px-4 text-right">{t("Weekly Net Flow", "Týždenný čistý tok", "Heti nettó folyam")}</th>
                            <th className="py-3 px-4 text-right text-emerald-600 ">{t("🏦 Bank Account Balance", "🏦 Stav na účte", "🏦 Bankszámla egyenleg")}</th>
                            <th className="py-3 px-4 text-center">{t("Calibration", "Nastavenie", "Kalibráció")}</th>
                            <th className="py-3 px-4 text-center">{t("Movements", "Pohyby", "Tételek")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100  font-medium">
                          {weeklyTrendData.map((w) => (
                            <tr
                              key={w.weekLabel + w.startIso}
                              className={`hover:bg-slate-50  transition-colors ${
                                w.isCurrent
                                  ? "bg-indigo-50/50  font-bold"
                                  : w.isFuture
                                  ? "bg-purple-50/20 "
                                  : ""
                              }`}
                            >
                              <td className="py-2.5 px-4">
                                <div className="font-bold text-slate-800 ">{w.weekLabel}</div>
                                <div className="text-[10px] text-slate-400">{w.dateRangeLabel} ({w.year})</div>
                              </td>
                              <td className="py-2.5 px-4">
                                {w.isCurrent ? (
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-100  text-indigo-700  text-[10px] font-bold">
                                    {t("Current Week", "Tento týždeň", "Aktuális hét")}
                                  </span>
                                ) : w.isFuture ? (
                                  <span className="px-2 py-0.5 rounded-md bg-purple-100  text-purple-700  text-[10px] font-bold">
                                    {t("🔮 Projected", "🔮 Prognóza", "🔮 Tervezett")}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100  text-slate-600  text-[10px]">
                                    {t("Historical", "História", "Múltbéli")}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-emerald-600 ">
                                {money(w.totalIncome)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-rose-600 ">
                                {money(w.totalExpense)}
                              </td>
                              <td className={`py-2.5 px-4 text-right font-black ${w.netDifference >= 0 ? "text-emerald-600 " : "text-rose-600 "}`}>
                                {w.netDifference >= 0 ? "+" : ""}{money(w.netDifference)}
                              </td>
                              <td className={`py-2.5 px-4 text-right font-black ${w.cumulativeBalance >= 0 ? "text-emerald-600 " : "text-rose-600 "}`}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <span>{money(w.cumulativeBalance)}</span>
                                  {w.isManuallyCalibrated && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-100  text-amber-700  border border-amber-300 font-bold">
                                      🎯 {t("Set", "Nastavené", "Fix")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCalibrator(w)}
                                    className="px-2 py-1 bg-slate-100  hover:bg-emerald-50  text-slate-600 hover:text-emerald-600 rounded-lg text-[10px] font-bold border border-slate-200  transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    <span>{w.isManuallyCalibrated ? t("Edit", "Upraviť", "Módosít") : t("Calibrate", "Nastaviť", "Beállít")}</span>
                                  </button>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100  text-[10px] text-slate-600  font-bold">
                                  {w.items.length}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 4. WEEK-SPECIFIC BANK BALANCE CALIBRATION DIALOG */}
          {calibratingWeek && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white  rounded-3xl border border-slate-200  shadow-2xl w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 ">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-2xl bg-emerald-50  text-emerald-600 ">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 ">
                        {t(`Calibrate Bank Balance for ${calibratingWeek.weekLabel}`, `Nastaviť zostatok na účte pre ${calibratingWeek.weekLabel}`, `Heti egyenleg beállítása: ${calibratingWeek.weekLabel}`)}
                      </h4>
                      <p className="text-[11px] text-slate-500 ">
                        {calibratingWeek.dateRangeLabel} ({calibratingWeek.year})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalibratingWeek(null)}
                    className="text-slate-400 hover:text-slate-600  p-1.5 rounded-xl hover:bg-slate-100 "
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700  block">
                    {t("Real Verified Bank Balance at this Week (€)", "Skutočný stav na účte v tomto týždni (€)", "Valós bankszámla egyenleg ezen a héten (€)")}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={calibratingVal}
                      onChange={(e) => setCalibratingVal(e.target.value)}
                      placeholder="48500"
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50  border border-slate-200  rounded-2xl text-base font-black text-slate-900  focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">€</span>
                  </div>
                  <p className="text-[11px] text-slate-500 ">
                    {t(
                      "Setting this anchor will recalculate the entire timeline: subsequent weeks will add cash flow starting from this sum, and preceding weeks will back-calculate.",
                      "Nastavenie tejto kotvy prepočíta celú časovú os: nasledujúce týždne budú pripočítavať zmeny k tejto sume.",
                      "A rögzítés újraszámolja a teljes idővonalat: a következő hetek ebből az összegből építkeznek."
                    )}
                  </p>
                </div>

                {/* Quick adjustments */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {t("Quick Adjustments", "Rýchle úpravy", "Gyors módosítás")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "+1 000 €", add: 1000 },
                      { label: "+5 000 €", add: 5000 },
                      { label: "+10 000 €", add: 10000 },
                      { label: "-1 000 €", add: -1000 },
                      { label: "-5 000 €", add: -5000 },
                      { label: "48 500 €", set: 48500 }
                    ].map((btn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const curr = parseFloat(calibratingVal) || 0;
                          if (btn.set !== undefined) {
                            setCalibratingVal(String(btn.set));
                          } else {
                            setCalibratingVal(String(curr + (btn.add || 0)));
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-100  hover:bg-slate-200  rounded-xl text-xs font-bold text-slate-700  transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="pt-3 border-t border-slate-100  flex items-center justify-between gap-2">
                  <div>
                    {calibratingWeek.isManual && (
                      <button
                        type="button"
                        onClick={() => handleResetWeeklyCalibration(calibratingWeek.startIso)}
                        className="px-3 py-2 bg-rose-50  hover:bg-rose-100 text-rose-700  rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Reset to Auto", "Vrátiť na auto", "Visszaállítás")}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalibratingWeek(null)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 "
                    >
                      {t("Cancel", "Zrušiť", "Mégse")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveWeeklyCalibration(calibratingWeek.startIso, parseFloat(calibratingVal))}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <Check className="h-4 w-4" />
                      {t("Save & Recalculate Timeline", "Uložiť a prepočítať os", "Mentés és újraszámolás")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4.5 TAB CONTENT: OVERVIEW TABLE MATRIX (EXPENSES -> INCOMES -> SUMMARY) */}
      {activeTab === "table" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* THE MATRIX DATA TABLE CONTAINER */}
          <div className="bg-white  rounded-3xl border border-slate-200/80  shadow-sm overflow-hidden">
            {/* Sleek Single-Line Table Toolbar */}
            <div className="px-5 py-3 border-b border-slate-100  flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 ">
              {/* Category Search Filter */}
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={tableSearchQuery}
                  onChange={(e) => setTableSearchQuery(e.target.value)}
                  placeholder={t("Filter categories...", "Filtrovať kategórie...", "Kategóriák szűrése...")}
                  className="w-full pl-8 pr-3 py-1 bg-white  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                />
                {tableSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTableSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Granularity & Year & Value Mode Switchers */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Granularity Switcher */}
                <div className="bg-slate-100  p-0.5 rounded-xl flex items-center gap-0.5 border border-slate-200 ">
                  {[
                    { id: "week", label: t("Week", "Týždeň", "Hét") },
                    { id: "month", label: t("Month", "Mesiac", "Hónap") },
                    { id: "quarter", label: t("Quarter", "Kvartál", "Negyedév") },
                    { id: "half", label: t("Half-year", "Polrok", "Félév") },
                    { id: "year", label: t("Year", "Rok", "Év") }
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setTableGranularity(g.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        tableGranularity === g.id
                          ? "bg-white  text-purple-600  shadow-2xs border border-slate-200 "
                          : "text-slate-600  hover:text-slate-900 "
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Year Navigator (for month, quarter, week) */}
                {(tableGranularity === "month" || tableGranularity === "quarter" || tableGranularity === "half" || tableGranularity === "week") && (
                  <div className="flex items-center bg-slate-100  px-1 py-0.5 rounded-xl border border-slate-200 ">
                    <button
                      type="button"
                      onClick={() => setTableYear(tableYear - 1)}
                      className="p-1 hover:bg-slate-200  rounded-lg text-slate-600  transition-colors cursor-pointer"
                      title={t("Previous Year", "Predchádzajúci rok", "Előző év")}
                    >
                      <ChevronDown className="h-3 w-3 rotate-90" />
                    </button>
                    <span className="px-2 text-xs font-black text-slate-800  select-none">
                      {tableYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTableYear(tableYear + 1)}
                      className="p-1 hover:bg-slate-200  rounded-lg text-slate-600  transition-colors cursor-pointer"
                      title={t("Next Year", "Nasledujúci rok", "Következő év")}
                    >
                      <ChevronDown className="h-3 w-3 -rotate-90" />
                    </button>
                  </div>
                )}

                {/* Real vs Estimated Value Mode Toggle */}
                <div className="bg-slate-100  p-0.5 rounded-xl flex items-center gap-0.5 border border-slate-200 ">
                  <button
                    type="button"
                    onClick={() => setTableValueMode("both")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "both"
                        ? "bg-white  text-slate-900  shadow-2xs border border-slate-200/80 "
                        : "text-slate-500 hover:text-slate-800 "
                    }`}
                  >
                    {t("Real + Est", "Skutočnosť + Plán", "Tény + Terv")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableValueMode("real")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "real"
                        ? "bg-emerald-500 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 "
                    }`}
                  >
                    {t("Real", "Skutočnosť", "Tény")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableValueMode("estimated")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "estimated"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 "
                    }`}
                  >
                    {t("Est", "Plán", "Terv")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableValueMode("total")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "total"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 "
                    }`}
                  >
                    {t("Combined", "Spolu", "Összesen")}
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                {/* Sticky Header */}
                <thead className="bg-slate-50  sticky top-0 z-30 shadow-xs border-b border-slate-200 ">
                  <tr>
                    <th className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-slate-100  z-40 font-black uppercase text-[10px] tracking-wider text-slate-600  border-r-2 border-slate-200  shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      {t("Category Structure (3 Levels)", "Štruktúra kategórií (3 úrovne)", "Kategória struktúra (3 szint)")}
                    </th>
                    {overviewTableData.columns.map((col) => (
                      <th
                        key={col.id}
                        className={`py-3 px-3 text-right font-black uppercase text-[10px] tracking-wider min-w-[110px] ${
                          col.isCurrent
                            ? "bg-indigo-50/80  text-indigo-700  border-x border-indigo-200 "
                            : "text-slate-600 "
                        }`}
                      >
                        <div className="flex flex-col items-end">
                          <span>{col.label}</span>
                          {col.subLabel && <span className="text-[8px] font-medium opacity-60 lowercase">{col.subLabel}</span>}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right font-black uppercase text-[10px] tracking-wider min-w-[130px] bg-slate-100  text-slate-900  border-l border-slate-200  sticky right-0 z-30">
                      {t("Total / Horizon", "Spolu / Horizont", "Összesen")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100  font-medium">
                  {/* ======================================================== */}
                  {/* SECTION 1: EXPENSES (TOP OF TABLE) */}
                  {/* ======================================================== */}
                  <tr className="bg-rose-50  border-y-2 border-rose-200 ">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-2.5 px-4 sticky left-0 z-20 bg-rose-50  border-r-2 border-rose-200  shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-wider text-rose-700  whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 shrink-0" />
                          <span>{t("💸 EXPENSES", "💸 VÝDAVKY", "💸 KIADÁSOK")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={areAllExpensesExpanded ? collapseAllExpenseCategories : expandAllExpenseCategories}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200   text-rose-700  text-[10px] font-bold tracking-normal normal-case transition-colors cursor-pointer"
                          title={areAllExpensesExpanded ? t("Collapse all expense categories", "Zbaliť výdavky", "Kiadások becsukása") : t("Expand all expense categories", "Rozbaliť výdavky", "Kiadások kinyitása")}
                        >
                          {areAllExpensesExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                          <span>{areAllExpensesExpanded ? t("Collapse", "Zbaliť", "Becsuk") : t("Expand", "Rozbaliť", "Kinyit")}</span>
                        </button>
                      </div>
                    </td>
                    <td colSpan={overviewTableData.columns.length + 1} className="py-2.5 px-4 bg-rose-50/60 " />
                  </tr>

                  {/* Render Expense Categories Recursively */}
                  {categoryTree.expenseTree.map((rootCat) => renderCategoryMatrixRow(rootCat, 1, "expense"))}
                  {renderUncategorizedMatrixRow("expense")}

                  {/* SUB-TOTAL EXPENSES ROW */}
                  <tr className="bg-rose-100/60  font-black border-y-2 border-rose-300 ">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-rose-100  z-20 text-rose-800  border-r-2 border-rose-300  shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <ArrowDownRight className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>{t("Total Expenses", "Výdavky spolu", "Összes kiadás")}{tableSearchTotalSuffix}</span>
                      </div>
                    </td>
                    {overviewTableData.columns.map((col) => {
                      const val = overviewTableData.totalExpensesByCol[col.id];
                      return (
                        <td key={"sub-exp-" + col.id} className="py-3 px-3 text-right">
                          {renderTableCellValue(val, "expense")}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-extrabold bg-rose-100  border-l border-slate-200  sticky right-0 z-20">
                      {renderTableCellValue(overviewTableData.totalExpenseSummary, "expense")}
                    </td>
                  </tr>

                  {/* ======================================================== */}
                  {/* SECTION 2: INCOMES (RIGHT BELOW EXPENSES) */}
                  {/* ======================================================== */}
                  <tr className="bg-emerald-50  border-y-2 border-emerald-200 ">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-2.5 px-4 sticky left-0 z-20 bg-emerald-50  border-r-2 border-emerald-200  shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-wider text-emerald-700  whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 shrink-0" />
                          <span>{t("💰 INCOMES", "💰 PRÍJMY", "💰 BEVÉTELEK")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={areAllIncomesExpanded ? collapseAllIncomeCategories : expandAllIncomeCategories}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 hover:bg-emerald-200   text-emerald-700  text-[10px] font-bold tracking-normal normal-case transition-colors cursor-pointer"
                          title={areAllIncomesExpanded ? t("Collapse all income categories", "Zbaliť príjmy", "Bevételek becsukása") : t("Expand all income categories", "Rozbaliť príjmy", "Bevételek kinyitása")}
                        >
                          {areAllIncomesExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                          <span>{areAllIncomesExpanded ? t("Collapse", "Zbaliť", "Becsuk") : t("Expand", "Rozbaliť", "Kinyit")}</span>
                        </button>
                      </div>
                    </td>
                    <td colSpan={overviewTableData.columns.length + 1} className="py-2.5 px-4 bg-emerald-50/60 " />
                  </tr>

                  {/* Render Income Categories Recursively */}
                  {categoryTree.incomeTree.map((rootCat) => renderCategoryMatrixRow(rootCat, 1, "income"))}
                  {renderUncategorizedMatrixRow("income")}

                  {/* SUB-TOTAL INCOMES ROW */}
                  <tr className="bg-emerald-100/60  font-black border-y-2 border-emerald-300 ">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-emerald-100  z-20 text-emerald-800  border-r-2 border-emerald-300  shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <ArrowUpRight className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>{t("Total Incomes", "Príjmy spolu", "Összes bevétel")}{tableSearchTotalSuffix}</span>
                      </div>
                    </td>
                    {overviewTableData.columns.map((col) => {
                      const val = overviewTableData.totalIncomesByCol[col.id];
                      return (
                        <td key={"sub-inc-" + col.id} className="py-3 px-3 text-right">
                          {renderTableCellValue(val, "income")}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-extrabold bg-emerald-100  border-l border-slate-200  sticky right-0 z-20">
                      {renderTableCellValue(overviewTableData.totalIncomeSummary, "income")}
                    </td>
                  </tr>

                  {/* ======================================================== */}
                  {/* SECTION 3: SUMMARY (NET FLOW & BALANCE) AT TABLE END */}
                  {/* ======================================================== */}
                  <tr className="bg-slate-100  border-y-2 border-slate-300 ">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-2.5 px-4 sticky left-0 z-20 bg-slate-100  border-r-2 border-slate-300  shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800  whitespace-nowrap">
                        <Landmark className="h-4 w-4 text-purple-600 shrink-0" />
                        <span>{t("📊 FINANCIAL SUMMARY", "📊 FINANČNÉ ZHRNUTIE", "📊 PÉNZÜGYI ÖSSZESÍTŐ")}</span>
                      </div>
                    </td>
                    <td colSpan={overviewTableData.columns.length + 1} className="py-2.5 px-4 bg-slate-100/80 " />
                  </tr>

                  {/* Row: Net Profit / Cash Flow (Income - Expense) */}
                  <tr className="bg-purple-50/50  font-black border-b border-slate-200 ">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-purple-50  z-20 text-purple-900  border-r-2 border-purple-300  shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Coins className="h-4 w-4 text-purple-600 shrink-0" />
                        <span>{t("Net Cash Flow (Diff = Income − Expense)", "Čistý rozdiel (Príjmy − Výdavky)", "Nettó eredmény (Bevétel − Kiadás)")}{tableSearchTotalSuffix}</span>
                      </div>
                    </td>
                    {overviewTableData.columns.map((col) => {
                      const net = overviewTableData.netCashFlowByCol[col.id];
                      return (
                        <td key={"net-" + col.id} className="py-3 px-3 text-right">
                          {renderTableCellValue(net, "net")}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-black bg-purple-100  border-l border-slate-200  sticky right-0 z-20">
                      {renderTableCellValue(overviewTableData.netSummary, "net")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4.6 TAB CONTENT: CHRONOLOGICAL MOVEMENTS LEDGER (TAB 3) */}
      {activeTab === "movements" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* MOVEMENTS CONTROL & FILTER CARD */}
          <div className="bg-white  p-4 rounded-3xl border border-slate-200/80  shadow-sm space-y-3">
            {/* Top Row: Title, KPI summary chips, Add buttons, Sort toggle */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100 ">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-900 ">
                    {t("All Financial Movements", "Všetky finančné pohyby", "Összes pénzügyi mozgás")}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100  text-slate-600 ">
                    {movementsSummary.count}
                  </span>
                  {movementsSummary.forecastCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100  text-violet-700  border border-violet-200 ">
                      +{expectedCountLabel(movementsSummary.forecastCount)}
                    </span>
                  )}
                </div>

                {/* Live Total KPI Pills */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-50  text-emerald-700  border border-emerald-200 ">
                      {t("Incomes:", "Príjmy:", "Bevételek:")} +{money(movementsSummary.income)}
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-rose-50  text-rose-700  border border-rose-200 ">
                      {t("Expenses:", "Výdavky:", "Kiadások:")} -{money(movementsSummary.expense)}
                    </span>
                    <span className={`px-2.5 py-1 rounded-xl border ${
                      movementsSummary.net >= 0
                        ? "bg-purple-50  text-purple-700  border-purple-200 "
                        : "bg-rose-50  text-rose-700  border-rose-200 "
                    }`}>
                      {t("Net:", "Čistý rozdiel:", "Nettó:")} {movementsSummary.net >= 0 ? "+" : ""}{money(movementsSummary.net)}
                    </span>

                    {/* The forecast is kept in its own pill: it is not money in the account. */}
                    {movementsSummary.forecastCount > 0 && (
                      <span
                        className="px-2.5 py-1 rounded-xl bg-violet-50  text-violet-700  border border-dashed border-violet-300  flex items-center gap-1.5"
                        title={t(
                          "Expected, not settled — this is not counted in the totals on the left",
                          "Očakávané, neuhradené — nie je započítané v sumách vľavo",
                          "Várható, nem teljesült — a bal oldali összegek ezt nem tartalmazzák"
                        )}
                      >
                        <Telescope className="h-3.5 w-3.5" />
                        {t("Expected net:", "Očakávaný rozdiel:", "Várható nettó:")}{" "}
                        {movementsSummary.expectedNet >= 0 ? "+" : ""}{money(movementsSummary.expectedNet)}
                      </span>
                    )}
                  </div>

                  {/* Settled vs still-expected within the totals above, so "Incomes: +X"
                      is never mistaken for money that has actually arrived (see F4). */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-0.5 text-[10px] font-semibold text-slate-400">
                    <span>
                      {t("Income:", "Príjmy:", "Bevételek:")} +{money(movementsSummary.incomeReal)}{" "}
                      {t("settled", "skutočnosť", "tény")} · +{money(movementsSummary.incomeEstimated)}{" "}
                      {t("expected", "plán", "terv")}
                    </span>
                    <span>
                      {t("Expense:", "Výdavky:", "Kiadások:")} -{money(movementsSummary.expenseReal)}{" "}
                      {t("settled", "skutočnosť", "tény")} · -{money(movementsSummary.expenseEstimated)}{" "}
                      {t("expected", "plán", "terv")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions: Sort order toggle & Quick Add Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Forecast overlay toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setShowFutureMovements((prev) => !prev);
                    setFutureHorizonMonths(1);
                  }}
                  aria-pressed={showFutureMovements}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors border ${
                    showFutureMovements
                      ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                      : "bg-violet-50  text-violet-700  border-violet-200  hover:bg-violet-100"
                  }`}
                  title={t(
                    "Draw the movements that have not happened yet into the ledger",
                    "Zobraziť v knihe aj pohyby, ktoré sa ešte nestali",
                    "A még meg nem történt tételek megjelenítése a listában"
                  )}
                >
                  <Telescope className="h-3.5 w-3.5" />
                  <span>{t("Future movements", "Budúce pohyby", "Várható tételek")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMovementsSortOrder(movementsSortOrder === "desc" ? "asc" : "desc")}
                  className="px-3 py-1.5 bg-slate-100  hover:bg-slate-200  text-slate-700  text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  title={movementsSortOrder === "desc" ? t("Sorted by newest first", "Zotriedené od najnovších", "Legújabb elöl") : t("Sorted by oldest first", "Zotriedené od najstarších", "Legrégebbi elöl")}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  <span>{movementsSortOrder === "desc" ? t("Newest First", "Najnovšie", "Legújabb") : t("Oldest First", "Najstaršie", "Legrégebbi")}</span>
                </button>

                {canEdit && (
                <button
                  onClick={() => handleOpenCreateModal("income", "global")}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("Income", "Príjem", "Bevétel")}</span>
                </button>
                )}

                {canEdit && (
                <button
                  onClick={() => handleOpenCreateModal("expense", "global")}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("Expense", "Výdavok", "Kiadás")}</span>
                </button>
                )}
              </div>
            </div>

            {/* FORECAST HORIZON STRIP — how far ahead the overlay reaches, and how to widen it */}
            {showFutureMovements && (
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 px-3 py-2.5 rounded-2xl bg-violet-50/70  border border-dashed border-violet-300  animate-in fade-in duration-150">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className="flex items-center gap-1.5 font-bold text-violet-900 ">
                    <Telescope className="h-4 w-4 text-violet-600 shrink-0" />
                    {t("Forecast", "Prognóza", "Előrejelzés")}
                  </span>
                  <span className="font-semibold text-violet-700 ">
                    {forecastHorizonLabel(futureHorizonMonths)}
                    <span className="font-medium text-violet-500">
                      {" · "}
                      {t("until", "do", "eddig")} {formatDateLocalized(forecastRange.endIso, userLanguage)}
                    </span>
                  </span>

                  {movementsSummary.forecastCount > 0 ? (
                    <span className="flex items-center gap-2 font-bold">
                      {movementsSummary.expectedIncome > 0 && (
                        <span className="text-emerald-600 ">+{money(movementsSummary.expectedIncome)}</span>
                      )}
                      {movementsSummary.expectedExpense > 0 && (
                        <span className="text-rose-600 ">-{money(movementsSummary.expectedExpense)}</span>
                      )}
                      <span className="text-violet-500 font-semibold">
                        {movementsSummary.forecastCount}{" "}
                        {t(
                          `expected movement${movementsSummary.forecastCount === 1 ? "" : "s"}`,
                          `${skExpected(movementsSummary.forecastCount)} ${skMovements(movementsSummary.forecastCount)}`,
                          "várható tétel"
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-violet-500 font-medium">
                      {t(
                        "Nothing expected in this window.",
                        "V tomto období sa nič neočakáva.",
                        "Ebben az időszakban nincs várható tétel."
                      )}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {futureHorizonMonths > 1 && (
                    <button
                      type="button"
                      onClick={() => setFutureHorizonMonths(1)}
                      className="px-2.5 py-1.5 text-[11px] font-bold rounded-xl text-violet-600  hover:bg-violet-100  transition-colors cursor-pointer"
                    >
                      {t("Back to one month", "Späť na jeden mesiac", "Vissza egy hónapra")}
                    </button>
                  )}

                  {canLoadAnotherForecastMonth ? (
                    <button
                      type="button"
                      onClick={() => setFutureHorizonMonths((prev) => prev + 1)}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{t("Load another month", "Načítať ďalší mesiac", "Még egy hónap")}</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 text-[11px] font-semibold text-violet-500 ">
                      {t(
                        "✓ Nothing further is expected",
                        "✓ Ďalej sa už nič neočakáva",
                        "✓ Ezután nincs több várható tétel"
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Main Filter Bar Row: Search, Type Toggle, Date Preset, Value Range */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
              {/* 1. Search Query Input */}
              <div className="md:col-span-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={movementsSearch}
                  onChange={(e) => setMovementsSearch(e.target.value)}
                  placeholder={t("Filter by title, client, project, category, #FA...", "Hľadať podľa názvu, klienta, projektu, kategórie...", "Keresés név, ügyfél, projekt vagy kategória alapján...")}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
                {movementsSearch && (
                  <button
                    type="button"
                    onClick={() => setMovementsSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* 2. Type Selector (All / Income / Expense) */}
              <div className="md:col-span-3 bg-slate-100  p-0.5 rounded-xl flex items-center gap-0.5 border border-slate-200 ">
                <button
                  type="button"
                  onClick={() => setMovementsType("all")}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                    movementsType === "all"
                      ? "bg-white  text-slate-900  shadow-2xs border border-slate-200/80 "
                      : "text-slate-500 hover:text-slate-800 "
                  }`}
                >
                  {t("All", "Všetko", "Összes")}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementsType("income")}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                    movementsType === "income"
                      ? "bg-emerald-500 text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-800 "
                  }`}
                >
                  {t("💰 Incomes", "💰 Príjmy", "💰 Bevételek")}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementsType("expense")}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                    movementsType === "expense"
                      ? "bg-rose-500 text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-800 "
                  }`}
                >
                  {t("💸 Expenses", "💸 Výdavky", "💸 Kiadások")}
                </button>
              </div>

              {/* 3. Date Range Preset */}
              <div className="md:col-span-3">
                <CustomSelect
                  value={movementsDatePreset}
                  onChange={(val) => setMovementsDatePreset(val as any)}
                  options={[
                    { value: "all", label: t("📅 All Time", "📅 Celé obdobie", "📅 Teljes időszak") },
                    { value: "this_month", label: t("📅 This Month", "📅 Tento mesiac", "📅 Ez a hónap") },
                    { value: "last_month", label: t("📅 Last Month", "📅 Minulý mesiac", "📅 Előző hónap") },
                    { value: "this_quarter", label: t("📅 This Quarter", "📅 Tento kvartál", "📅 Ez a negyedév") },
                    { value: "this_year", label: t("📅 This Year", "📅 Tento rok", "📅 Ez az év") },
                    { value: "custom", label: t("⚙️ Custom Date Range...", "⚙️ Vlastný rozsah dátumov...", "⚙️ Egyéni időszak...") },
                  ]}
                  size="sm"
                  className="w-full text-xs font-semibold rounded-xl bg-slate-50 border-slate-200"
                />
              </div>

              {/* 4. Advanced Filters Toggle */}
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMovementsAdvancedOpen(!isMovementsAdvancedOpen)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isMovementsAdvancedOpen || hasActiveMovementsFilters
                      ? "bg-purple-100  text-purple-700  border border-purple-300 "
                      : "bg-slate-100  text-slate-600  hover:bg-slate-200 "
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{t("Filters", "Filtre", "Szűrők")}</span>
                  {hasActiveMovementsFilters && (
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                  )}
                </button>

                {hasActiveMovementsFilters && (
                  <button
                    type="button"
                    onClick={clearAllMovementsFilters}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title={t("Clear all filters", "Zrušiť všetky filtre", "Szűrők törlése")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Advanced Filters Drawer: Value Range, Category, Client/Project Scope, Custom Dates */}
            {isMovementsAdvancedOpen && (
              <div className="pt-3 border-t border-slate-100  grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in fade-in duration-150">
                {/* Category Dropdown (All 3 levels) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500  mb-1">
                    {t("Category (3 Levels)", "Kategória (3 úrovne)", "Kategória (3 szint)")}
                  </label>
                  <SearchableCategorySelect
                    value={movementsCategoryId}
                    onChange={(catId) => setMovementsCategoryId(catId)}
                    categories={financialCategories}
                    filterType={movementsType}
                    allowAll={true}
                    t={t}
                  />
                </div>

                {/* Scope / Project / Client */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500  mb-1">
                    {t("Linked Project / Client", "Prepojený projekt / Klient", "Kapcsolt projekt / Ügyfél")}
                  </label>
                  <SearchableScopeSelect
                    value={
                      movementsScope === "global"
                        ? "global"
                        : movementsScope === "project"
                        ? (movementsProjectId === "all" ? "project:all" : `project:${movementsProjectId}`)
                        : movementsScope === "client"
                        ? (movementsClientId === "all" ? "client:all" : `client:${movementsClientId}`)
                        : "all"
                    }
                    onChange={(val) => {
                      if (val === "all" || !val) {
                        setMovementsScope("all");
                        setMovementsProjectId("all");
                        setMovementsClientId("all");
                      } else if (val === "global") {
                        setMovementsScope("global");
                        setMovementsProjectId("all");
                        setMovementsClientId("all");
                      } else if (val.startsWith("project:")) {
                        setMovementsScope("project");
                        setMovementsProjectId(val.replace("project:", ""));
                        setMovementsClientId("all");
                      } else if (val.startsWith("client:")) {
                        setMovementsScope("client");
                        setMovementsClientId(val.replace("client:", ""));
                        setMovementsProjectId("all");
                      }
                    }}
                    projects={projects}
                    leads={leads}
                    allowAll={true}
                    allowGlobal={true}
                    t={t}
                  />
                </div>

                {/* Value Range (Min & Max) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500  mb-1">
                    {t("Value Range (€)", "Rozsah sumy (€)", "Értékhatár (€)")}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={movementsMinAmount}
                      onChange={(e) => setMovementsMinAmount(e.target.value)}
                      placeholder="Min €"
                      className="w-1/2 py-1.5 px-2.5 bg-slate-50  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-slate-400 font-bold">–</span>
                    <input
                      type="number"
                      value={movementsMaxAmount}
                      onChange={(e) => setMovementsMaxAmount(e.target.value)}
                      placeholder="Max €"
                      className="w-1/2 py-1.5 px-2.5 bg-slate-50  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Custom Date Range Picker */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500  mb-1">
                    {t("Custom Dates (From - To)", "Vlastný dátum (Od - Do)", "Egyéni dátum (Tól - Ig)")}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={movementsStartDate}
                      onChange={(e) => {
                        setMovementsStartDate(e.target.value);
                        setMovementsDatePreset("custom");
                      }}
                      className="w-1/2 py-1.5 px-2 bg-slate-50  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-slate-400 font-bold">–</span>
                    <input
                      type="date"
                      value={movementsEndDate}
                      onChange={(e) => {
                        setMovementsEndDate(e.target.value);
                        setMovementsDatePreset("custom");
                      }}
                      className="w-1/2 py-1.5 px-2 bg-slate-50  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* GROUPED MOVEMENTS LEDGER TABLE */}
          <div className="bg-white  rounded-3xl border border-slate-200/80  shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50  text-slate-600  font-black uppercase text-[10px] tracking-wider border-b border-slate-200  sticky top-0 z-20">
                  <tr>
                    <th className="py-3 px-4 w-[130px]">{t("Date", "Dátum", "Dátum")}</th>
                    <th className="py-3 px-4 min-w-[220px]">{t("Title & Reference", "Názov & Referencia", "Megnevezés & Hivatkozás")}</th>
                    <th className="py-3 px-4 min-w-[220px]">{t("Category Hierarchy", "Hierarchia kategórie", "Kategória hierarchia")}</th>
                    <th className="py-3 px-4 min-w-[170px]">{t("Link / Scope", "Prepojenie / Rozsah", "Kapcsolat / Hatókör")}</th>
                    <th className="py-3 px-4 w-[160px]">{t("Payment Status", "Stav úhrady", "Fizetési állapot")}</th>
                    <th className="py-3 px-4 w-[150px] text-right">{t("Value", "Suma / Hodnota", "Összeg / Érték")}</th>
                    <th className="py-3 px-4 w-[90px] text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100  font-medium">
                  {movementsSummary.rowCount === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 font-medium space-y-2">
                        <Coins className="h-10 w-10 text-slate-300  mx-auto" />
                        <p className="text-sm font-bold text-slate-700 ">
                          {t("No financial movements found", "Neboli nájdené žiadne finančné pohyby", "Nincs találat a megadott szűrők alapján")}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t("Try clearing or adjusting your search filters.", "Skúste upraviť alebo resetovať filtre.", "Próbálja meg módosítani vagy törölni a szűrőket.")}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      let globalRenderCount = 0;

                      return groupedMovementsByMonth.map((group) => {
                        // Check if we reached visible limit for infinite scroll
                        if (globalRenderCount >= movementsVisibleCount) return null;

                        const availableSlot = movementsVisibleCount - globalRenderCount;
                        const visibleRows = group.rows.slice(0, availableSlot);
                        globalRenderCount += visibleRows.length;

                        // A month made up only of expected movements is a month
                        // that has not happened — its divider says so, instead
                        // of looking like any other month of history.
                        const settledInGroup = group.rows.length - group.forecastCount;
                        const isForecastOnlyMonth = settledInGroup === 0 && group.forecastCount > 0;

                        return (
                          <React.Fragment key={"month-grp-" + group.monthKey}>
                            {/* MONTH DIVIDER ROW WITH SUMMARY TOTALS */}
                            <tr className={`border-y-2 sticky top-[37px] z-10 shadow-xs ${
                              isForecastOnlyMonth
                                ? "bg-violet-100/90  border-violet-300 "
                                : "bg-slate-100/90  border-slate-300 "
                            }`}>
                              <td colSpan={7} className="py-2.5 px-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    {isForecastOnlyMonth ? (
                                      <Telescope className="h-4 w-4 text-violet-600 " />
                                    ) : (
                                      <CalendarDays className="h-4 w-4 text-purple-600 " />
                                    )}
                                    <span className={`font-black text-xs uppercase tracking-wider ${
                                      isForecastOnlyMonth ? "text-violet-900 " : "text-slate-900 "
                                    }`}>
                                      {group.monthLabel}
                                    </span>
                                    {settledInGroup > 0 && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white  text-slate-600  border border-slate-200 ">
                                        {settledInGroup} {t("movements", "pohybov", "tétel")}
                                      </span>
                                    )}
                                    {group.forecastCount > 0 && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white  text-violet-700  border border-dashed border-violet-300 ">
                                        {expectedCountLabel(group.forecastCount)}
                                      </span>
                                    )}
                                  </div>

                                  {/* Monthly subtotals — settled first, expected kept apart from it */}
                                  <div className="flex flex-wrap items-center gap-3 text-xs font-black">
                                    {settledInGroup > 0 && (
                                      <>
                                        <span className="text-emerald-700  flex flex-col items-end leading-tight">
                                          <span>+{money(group.totalIncome)}</span>
                                          {group.incomeEstimated !== 0 && (
                                            <span className="text-[9px] font-semibold text-emerald-500/80">
                                              est: +{money(group.incomeEstimated)}
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-rose-700  flex flex-col items-end leading-tight">
                                          <span>-{money(group.totalExpense)}</span>
                                          {group.expenseEstimated !== 0 && (
                                            <span className="text-[9px] font-semibold text-rose-500/80">
                                              est: -{money(group.expenseEstimated)}
                                            </span>
                                          )}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-lg border ${
                                          group.net >= 0
                                            ? "bg-emerald-50  text-emerald-700  border-emerald-300 "
                                            : "bg-rose-50  text-rose-700  border-rose-300 "
                                        }`}>
                                          {t("Net:", "Čistý:", "Nettó:")} {group.net >= 0 ? "+" : ""}{money(group.net)}
                                        </span>
                                      </>
                                    )}
                                    {group.forecastCount > 0 && (
                                      <span className="px-2 py-0.5 rounded-lg border border-dashed border-violet-300  bg-violet-50  text-violet-700  flex items-center gap-2">
                                        <Telescope className="h-3 w-3" />
                                        <span>{t("Expected:", "Očakávané:", "Várható:")}</span>
                                        {group.expectedIncome > 0 && <span>+{money(group.expectedIncome)}</span>}
                                        {group.expectedExpense > 0 && <span>-{money(group.expectedExpense)}</span>}
                                        {group.expectedIncome > 0 && group.expectedExpense > 0 && (
                                          <span>
                                            {t("net", "čistý", "nettó")}{" "}
                                            {group.expectedNet >= 0 ? "+" : ""}{money(group.expectedNet)}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>

                            {/* MOVEMENT ROWS IN THIS MONTH */}
                            {visibleRows.map((row) => {
                              // A forecast row has no record of its own: nothing
                              // of it is stored, so it cannot be given a status,
                              // edited in place or deleted — only followed back
                              // to the rule or invoice it was derived from.
                              if (row.kind === "forecast") {
                                const forecast = row.forecast;
                                const source = forecast.record;
                                const forecastProject = projects.find((p) => p.id === source.projectId);
                                const forecastClient = leads.find(
                                  (l) => l.id === source.clientId || l.id === forecastProject?.clientId || l.id === forecastProject?.leadId
                                );
                                const forecastCrumbs = getCategoryBreadcrumbs(source.categoryId);
                                const forecastRootCat = forecastCrumbs[0];
                                const forecastIsExpense = forecast.type === "expense";
                                const SourceIcon = FORECAST_SOURCE_ICON[forecast.source];

                                return (
                                  <tr key={row.key} data-forecast="true" className={FORECAST_ROW_CLASS}>
                                    {/* 1. The day the money is expected, and how far off that is */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                      <div className="font-bold text-violet-900 ">
                                        {formatDateLocalized(forecast.date, userLanguage)}
                                      </div>
                                      <div className="text-[10px] font-medium text-violet-500 mt-0.5">
                                        {daysAheadLabel(forecast.date)}
                                      </div>
                                    </td>

                                    {/* 2. Title & reference, read off the source */}
                                    <td className="py-3 px-4">
                                      <div className="font-bold text-violet-900  flex items-center gap-1.5">
                                        <span className="truncate max-w-[280px]" title={source.title}>
                                          {source.title}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {source.invoiceNumber && (
                                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-100/70  text-violet-700  font-semibold">
                                            {source.invoiceNumber}
                                          </span>
                                        )}
                                        {source.description && (
                                          <span className="text-[11px] text-violet-400 truncate max-w-[220px]" title={source.description}>
                                            {source.description}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* 3. Category breadcrumbs of the source */}
                                    <td className="py-3 px-4">
                                      {forecastCrumbs.length > 0 ? (
                                        <div className="flex items-center gap-1.5 flex-wrap opacity-80">
                                          <span
                                            className="h-2 w-2 rounded-full shrink-0 shadow-2xs"
                                            style={{ backgroundColor: forecastRootCat?.color || (forecastIsExpense ? "#f43f5e" : "#10b981") }}
                                          />
                                          {forecastCrumbs.map((c, idx) => (
                                            <React.Fragment key={c.id}>
                                              {idx > 0 && <span className="text-[10px] text-violet-400">›</span>}
                                              <span
                                                className={`text-[11px] ${
                                                  idx === forecastCrumbs.length - 1
                                                    ? "font-bold text-violet-800 "
                                                    : "font-normal text-violet-500 "
                                                }`}
                                              >
                                                {c.name}
                                              </span>
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-violet-400 italic text-[11px]">
                                          {t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
                                        </span>
                                      )}
                                    </td>

                                    {/* 4. Link / Scope of the source */}
                                    <td className="py-3 px-4">
                                      {source.projectId ? (
                                        (() => {
                                          const projectLead = forecastProject
                                            ? leads.find((l) => l.id === forecastProject.leadId || l.id === forecastProject.clientId)
                                            : null;
                                          const pName = projectLead ? `${projectLead.name}` : `Projekt ${source.projectId!.slice(0, 8)}`;
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => onOpenProject?.(source.projectId!)}
                                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50/70  hover:bg-indigo-100 text-indigo-700  rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                            >
                                              <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                              <span className="truncate max-w-[140px]" title={pName}>
                                                {pName}
                                              </span>
                                            </button>
                                          );
                                        })()
                                      ) : source.clientId ? (
                                        <button
                                          type="button"
                                          onClick={() => onOpenClient?.(source.clientId!)}
                                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50/70  hover:bg-emerald-100 text-emerald-700  rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                        >
                                          <User className="h-3.5 w-3.5 shrink-0" />
                                          <span className="truncate max-w-[140px]" title={forecastClient?.name || source.clientId}>
                                            {forecastClient?.name || source.clientId.slice(0, 8)}
                                          </span>
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-violet-500 font-medium">
                                          <Globe className="h-3 w-3 text-violet-400 shrink-0" />
                                          <span>{t("Global Company", "Globálne firemné", "Globális vállalati")}</span>
                                        </span>
                                      )}
                                    </td>

                                    {/* 5. Where it came from, in place of a payment status it cannot have */}
                                    <td className="py-3 px-4">
                                      <span
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-dashed border-violet-300  bg-violet-50  text-violet-700 "
                                        title={t(
                                          "Expected, not recorded — nothing is stored for this day yet",
                                          "Očakávané, nezaznamenané — pre tento deň zatiaľ nič nie je uložené",
                                          "Várható, nem rögzített — erre a napra még nincs mentett tétel"
                                        )}
                                      >
                                        <SourceIcon className="h-3 w-3 shrink-0" />
                                        {forecastSourceLabel(forecast.source)}
                                      </span>
                                    </td>

                                    {/* 6. Value — approximate, and visibly lighter than a settled one */}
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <span
                                          className={`font-black text-sm italic ${
                                            forecastIsExpense ? "text-rose-400 " : "text-emerald-500 "
                                          }`}
                                        >
                                          ≈ {forecastIsExpense ? "-" : "+"}{money(forecast.amount)}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-violet-400 mt-0.5">
                                        {t("expected", "očakávané", "várható")}
                                      </div>
                                    </td>

                                    {/* 7. The only action there is: open what it was derived from */}
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            forecast.source === "recurring"
                                              ? handleOpenOccurrenceModal(source, forecast.date)
                                              : handleOpenEditModal(source)
                                          }
                                          className="p-1.5 hover:bg-violet-100  rounded-lg text-violet-500 hover:text-violet-900  transition-colors cursor-pointer"
                                          title={
                                            forecast.source === "recurring"
                                              ? t("Edit this payment only", "Upraviť iba túto platbu", "Csak ennek a fizetésnek a szerkesztése")
                                              : t(
                                                  "Open the movement this is expected from",
                                                  "Otvoriť pohyb, z ktorého to vychádza",
                                                  "A várható tétel forrásának megnyitása"
                                                )
                                          }
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              // A charge a recurring rule has already made. It
                              // happened, so it is drawn and counted as settled,
                              // but nothing of it is stored: no status to set,
                              // nothing to delete. Editing it stores that one
                              // payment as a movement of its own and takes the
                              // day off the rule's schedule.
                              if (row.kind === "charge") {
                                const charge = row.charge;
                                const chargeIsExpense = charge.type === "expense";
                                const RecurringIcon = FORECAST_SOURCE_ICON.recurring;

                                return (
                                  <tr key={row.key} data-recurring-charge="true" className={RECURRING_CHARGE_ROW_CLASS}>
                                    {/* 1. The day the rule charged */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                      <div className="font-bold text-slate-800 ">
                                        {formatDateLocalized(charge.date, userLanguage)}
                                      </div>
                                    </td>

                                    {renderLedgerSourceCells(charge.record)}

                                    {/* 5. Where it came from, in place of a payment status it cannot have */}
                                    <td className="py-3 px-4">
                                      <span
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-purple-200  bg-purple-50  text-purple-700 "
                                        title={t(
                                          "Charged by a recurring rule — drawn from its schedule, not a separately stored movement",
                                          "Platba pravidelného pohybu — vychádza z jeho plánu, nie je to samostatne uložený pohyb",
                                          "Ismétlődő tétel terhelése — az ütemezéséből számolva, nem külön mentett tétel"
                                        )}
                                      >
                                        <RecurringIcon className="h-3 w-3 shrink-0" />
                                        {forecastSourceLabel("recurring")}
                                      </span>
                                    </td>

                                    {/* 6. Value — settled, at the price in force on the day */}
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <span
                                          className={`font-black text-sm ${
                                            chargeIsExpense ? "text-rose-600 " : "text-emerald-600 "
                                          }`}
                                        >
                                          {chargeIsExpense ? "-" : "+"}
                                          {money(charge.amount)}
                                        </span>
                                        {renderRecurringValueIcon(charge.record)}
                                      </div>
                                    </td>

                                    {/* 7. The only action there is: open the rule it was charged by */}
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenOccurrenceModal(charge.record, charge.date)}
                                          className="p-1.5 hover:bg-slate-100  rounded-lg text-slate-500 hover:text-slate-900  transition-colors cursor-pointer"
                                          title={t("Edit this payment only", "Upraviť iba túto platbu", "Csak ennek a fizetésnek a szerkesztése")}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              const rec = row.record;
                              const isExpense = rec.type === "expense";
                              // Whole value real + estimated (see F4); the settled/expected
                              // split is shown separately below as the "est:" subtitle.
                              const { real: amountReal, estimated: amountEstimated } = splitRecordAmounts(rec);
                              const amount = amountReal + amountEstimated;
                              // A recurring rule's own row that a charge before it
                              // already paid for: still the rule, still drawn, but
                              // not counted in the month (see pastRecurringCharges.ts).
                              const isUncountedRuleRow = pastRecurring.uncountedIds.has(rec.id);

                              return (
                                <tr
                                  key={row.key}
                                  className="hover:bg-slate-50/80  transition-colors group"
                                >
                                  {/* 1. Date (status lives in its own editable column) */}
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <div className="font-bold text-slate-800 ">
                                      {formatDateLocalized(rec.paidDate || rec.issueDate, userLanguage)}
                                    </div>
                                    {rec.dueDate && !rec.paidDate && (
                                      <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                                        {t("due", "splatnosť", "esedékes")} {formatDateLocalized(rec.dueDate, userLanguage)}
                                      </div>
                                    )}
                                  </td>

                                  {renderLedgerSourceCells(rec)}

                                  {/* 5. Payment status — editable straight from the row */}
                                  <td className="py-3 px-4">
                                    {canEdit ? (
                                      <CustomSelect
                                        size="sm"
                                        value={rec.status}
                                        onChange={(next) => handleInlineStatusChange(rec, next as FinancialStatus)}
                                        options={movementStatusOptions}
                                        unstyled
                                        className={`gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border cursor-pointer hover:brightness-95 ${movementStatusBadgeClass(rec.status)}`}
                                      />
                                    ) : (
                                      <span
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${movementStatusBadgeClass(rec.status)}`}
                                      >
                                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${MOVEMENT_STATUS_DOT[rec.status]}`} />
                                        {movementStatusLabel(rec.status)}
                                      </span>
                                    )}
                                  </td>

                                  {/* 6. Value with Color Coding & Recurring Icon */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <span
                                        className={`font-black text-sm ${
                                          isUncountedRuleRow
                                            ? "text-slate-400 "
                                            : isExpense
                                            ? "text-rose-600 "
                                            : "text-emerald-600 "
                                        }`}
                                      >
                                        {isExpense ? "-" : "+"}
                                        {money(amount)}
                                      </span>

                                      {/* Recurring Expense/Income icon next to value */}
                                      {rec.isRecurring && renderRecurringValueIcon(rec)}
                                    </div>

                                    {isUncountedRuleRow ? (
                                      <div
                                        className="text-[10px] text-slate-400 mt-0.5"
                                        title={t(
                                          "This row is the recurring rule itself. A charge before it already paid for this period, so it is not added to the month's totals. The rule's charges are the rows marked Recurring.",
                                          "Tento riadok je samotný pravidelný pohyb. Obdobie už pokryla platba pred ním, preto sa do súčtu mesiaca nepripočítava. Platby pohybu sú riadky označené Pravidelné.",
                                          "Ez a sor maga az ismétlődő tétel. Az időszakot már egy korábbi terhelés fedezte, ezért nem adódik a havi összeghez. A terhelései az Ismétlődő jelölésű sorok."
                                        )}
                                      >
                                        {t("rule · not counted", "pravidlo · nezapočítané", "szabály · nem számolva")}
                                      </div>
                                    ) : (
                                      /* Estimated amount subtitle — the still-outstanding part, same rule as splitRecordAmounts */
                                      amountEstimated !== 0 && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                          est: {money(amountEstimated)}
                                        </div>
                                      )
                                    )}
                                  </td>

                                  {/* 7. Action buttons */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenLedgerRow(rec)}
                                        className="p-1.5 hover:bg-slate-100  rounded-lg text-slate-500 hover:text-slate-900  transition-colors cursor-pointer"
                                        title={t("Edit movement", "Upraviť pohyb", "Szerkesztés")}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTransaction(rec.id)}
                                        className="p-1.5 hover:bg-rose-50  rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                        title={t("Delete movement", "Vymazať pohyb", "Törlés")}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      });
                    })()
                  )}
                </tbody>
              </table>
            </div>

            {/* Infinite Scroll Loading Sentinel */}
            {movementsSummary.rowCount > 0 && (
              <div
                ref={movementsSentinelRef}
                className="py-6 border-t border-slate-100  flex items-center justify-center text-xs text-slate-400 font-medium"
              >
                {movementsVisibleCount < movementsSummary.rowCount ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-600" />
                    <span>
                      {t(
                        `Loading more movements... (showing ${Math.min(movementsVisibleCount, movementsSummary.rowCount)} of ${movementsSummary.rowCount})`,
                        `Načítavam ďalšie pohyby... (zobrazených ${Math.min(movementsVisibleCount, movementsSummary.rowCount)} z ${movementsSummary.rowCount})`,
                        `További mozgások betöltése... (${Math.min(movementsVisibleCount, movementsSummary.rowCount)} / ${movementsSummary.rowCount})`
                      )}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400">
                    {t(
                      `✓ All ${movementsSummary.rowCount} movements loaded`,
                      `✓ Všetkých ${movementsSummary.rowCount} pohybov načítaných`,
                      `✓ Mind a(z) ${movementsSummary.rowCount} mozgás betöltve`
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: RECURRING EXPENSES MANAGER */}
      {activeTab === "recurring" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* TOP METRIC CARDS */}
          {/* Icon + label share a header row and the figure sits below, so a narrow
              column never squeezes the label into a one-word-per-line stack. */}
          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 sm:gap-4">
            {/* Card 1: Monthly Recurring Commitment */}
            <div className="p-4 rounded-3xl bg-white  border border-slate-200/80  shadow-sm flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-rose-50  text-rose-600  shrink-0">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-snug line-clamp-2">
                  {t("Monthly Recurring Costs", "Mesačné pravidelné výdavky", "Havi rendszeres kiadás")}
                </div>
              </div>
              <div className="text-lg font-black tabular-nums flex flex-wrap items-baseline gap-x-1 min-w-0 text-rose-600 ">
                <span className="whitespace-nowrap">-{money(recurringMetrics.totalMonthlyExpense)}</span>
                <span className="text-xs font-semibold text-slate-400">/ {t("mo", "mes", "hó")}</span>
              </div>
            </div>

            {/* Card 2: Annual Overhead Projection */}
            <div className="p-4 rounded-3xl bg-white  border border-slate-200/80  shadow-sm flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-purple-50  text-purple-600  shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-snug line-clamp-2">
                  {t("Annual Overhead Projection", "Ročný projektovaný náklad", "Éves tervezett költség")}
                </div>
              </div>
              <div className="text-lg font-black tabular-nums flex flex-wrap items-baseline gap-x-1 min-w-0 text-slate-900 ">
                <span className="whitespace-nowrap">-{money(recurringMetrics.totalAnnualExpense)}</span>
                <span className="text-xs font-semibold text-slate-400">/ {t("yr", "rok", "év")}</span>
              </div>
            </div>

            {/* Card 1b: Monthly Recurring Income */}
            <div className="p-4 rounded-3xl bg-white  border border-slate-200/80  shadow-sm flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-50  text-emerald-600  shrink-0">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-snug line-clamp-2">
                  {t("Monthly Recurring Income", "Mesačný pravidelný príjem", "Havi rendszeres bevétel")}
                </div>
              </div>
              <div className="text-lg font-black tabular-nums flex flex-wrap items-baseline gap-x-1 min-w-0 text-emerald-600 ">
                <span className="whitespace-nowrap">+{money(recurringMetrics.totalMonthlyIncome)}</span>
                <span className="text-xs font-semibold text-slate-400">/ {t("mo", "mes", "hó")}</span>
              </div>
            </div>

            {/* Card 2b: Annual Recurring Income Projection */}
            <div className="p-4 rounded-3xl bg-white  border border-slate-200/80  shadow-sm flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-50  text-emerald-600  shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-snug line-clamp-2">
                  {t("Annual Recurring Income Projection", "Ročný projektovaný príjem", "Éves tervezett bevétel")}
                </div>
              </div>
              <div className="text-lg font-black tabular-nums flex flex-wrap items-baseline gap-x-1 min-w-0 text-slate-900 ">
                <span className="whitespace-nowrap">+{money(recurringMetrics.totalAnnualIncome)}</span>
                <span className="text-xs font-semibold text-slate-400">/ {t("yr", "rok", "év")}</span>
              </div>
            </div>

            {/* Card 3: Active vs Paused Rules */}
            <div className="p-4 rounded-3xl bg-white  border border-slate-200/80  shadow-sm flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-50  text-emerald-600  shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-snug line-clamp-2">
                  {t("Active Commitments", "Aktívne pravidlá", "Aktív szabályok")}
                </div>
              </div>
              <div className="text-lg font-black tabular-nums flex flex-wrap items-baseline gap-x-1 min-w-0 text-slate-900 ">
                <span>{recurringMetrics.activeCount}</span>
                {recurringMetrics.pausedCount > 0 && (
                  <span className="text-xs font-semibold text-slate-400">
                    ({recurringMetrics.pausedCount} {t("paused", "pozastavených", "szünetel")})
                  </span>
                )}
              </div>
            </div>

            {/* Card 4: Next Upcoming Charge */}
            <div className="p-4 rounded-3xl bg-white  border border-slate-200/80  shadow-sm flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-amber-50  text-amber-600  shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-snug line-clamp-2">
                  {t("Next Upcoming Charge", "Najbližšia platba", "Következő esedékes")}
                </div>
              </div>
              {(() => {
                const upcoming = recurringMetrics.nextUpcoming;
                if (!upcoming) {
                  return <div className="text-xs text-slate-400">{t("None scheduled", "Žiadna", "Nincs")}</div>;
                }
                return (
                  <div className="min-w-0">
                    <div className={`text-lg font-black tabular-nums whitespace-nowrap ${upcoming.record.type === "income" ? "text-emerald-600 " : "text-rose-600 "}`}>
                      {upcoming.record.type === "income" ? "+" : "-"}{money(upcoming.amount)}
                    </div>
                    <div className="text-xs font-semibold text-slate-900  truncate" title={upcoming.record.title}>
                      {upcoming.record.title}
                    </div>
                    <div className="text-[10px] text-amber-600  font-semibold">
                      {upcoming.daysLeft === 0 ? t("Today", "Dnes", "Ma") : t(`in ${upcoming.daysLeft}d`, `o ${upcoming.daysLeft} dní`, `${upcoming.daysLeft} nap múlva`)}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* CONTROL & FILTER CARD */}
          <div className="bg-white  p-4 rounded-3xl border border-slate-200/80  shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100 ">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-purple-600 " />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 ">
                    {t("Recurring Expenses & Subscriptions", "Pravidelné výdavky a predplatné", "Rendszeres kiadások és előfizetések")}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t("Configure weekly, monthly, and yearly overheads that automatically calculate in cash flow projections.", "Nastavenie pravidelných výdavkov a fixných nákladov premietaných do cash flow prognózy.", "Rendszeres költségek beállítása és kezelése a pénzáramlás előrejelzéséhez.")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {financialRecords.filter((r) => r.isRecurring).length === 0 && (
                  <button
                    type="button"
                    onClick={handleQuickSeedRecurringExpenses}
                    className="px-3.5 py-1.5 bg-purple-50  hover:bg-purple-100 text-purple-700  text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border border-purple-200  transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{t("Load Sample Templates", "Nahrať vzorové šablóny", "Minták betöltése")}</span>
                  </button>
                )}

                {canEdit && (
                <button
                  type="button"
                  onClick={() => handleOpenCreateRecurringModal("expense", "global")}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t("New Recurring Expense", "Nový pravidelný výdavok", "Új rendszeres kiadás")}</span>
                </button>
                )}
              </div>
            </div>

            {/* Filter Bar Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center text-xs">
              {/* Search input */}
              <div className="lg:col-span-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={recurringSearch}
                  onChange={(e) => setRecurringSearch(e.target.value)}
                  placeholder={t("Search by expense title, vendor, category...", "Hľadať podľa názvu, kategórie...", "Keresés név, kategória alapján...")}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {recurringSearch && (
                  <button
                    type="button"
                    onClick={() => setRecurringSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Frequency Selector */}
              <div className="lg:col-span-3">
                <CustomSelect
                  value={recurringFreqFilter}
                  onChange={(val) => setRecurringFreqFilter(val)}
                  options={[
                    { value: "all", label: t("All Frequencies", "Všetky frekvencie", "Minden gyakoriság") },
                    { value: "weekly", label: t("Weekly (Týždenne)", "Týždenne", "Heti") },
                    { value: "monthly", label: t("Monthly (Mesačne)", "Mesačne", "Havi") },
                    { value: "yearly", label: t("Yearly (Ročne)", "Ročne", "Éves") },
                  ]}
                  size="sm"
                  className="w-full text-xs font-semibold rounded-xl bg-slate-50 border-slate-200"
                />
              </div>

              {/* Status Filter */}
              <div className="lg:col-span-3">
                <CustomSelect
                  value={recurringStatusFilter}
                  onChange={(val) => setRecurringStatusFilter(val as any)}
                  options={[
                    { value: "all", label: t("All Statuses (Active & Paused)", "Všetky stavy (Aktívne aj pozastavené)", "Minden állapot") },
                    { value: "active", label: t("✓ Active Rules Only", "✓ Iba aktívne pravidlá", "✓ Csak aktív szabályok") },
                    { value: "paused", label: t("⏸ Paused Rules Only", "⏸ Iba pozastavené", "⏸ Csak szüneteltetett") },
                  ]}
                  size="sm"
                  className="w-full text-xs font-semibold rounded-xl bg-slate-50 border-slate-200"
                />
              </div>

              {/* Entity Scope Filter */}
              <div className="lg:col-span-2">
                <CustomSelect
                  value={recurringScopeFilter}
                  onChange={(val) => setRecurringScopeFilter(val)}
                  options={[
                    { value: "all", label: t("All Scopes", "Všetky rozsahy", "Minden hatókör") },
                    { value: "global", label: t("🌐 Global Only", "🌐 Iba firemné", "🌐 Vállalati") },
                    { value: "project", label: t("💼 Projects Only", "💼 Iba projekty", "💼 Projektek") },
                    { value: "client", label: t("👤 Clients Only", "👤 Iba klienti", "👤 Ügyfelek") },
                  ]}
                  size="sm"
                  className="w-full text-xs font-semibold rounded-xl bg-slate-50 border-slate-200"
                />
              </div>
            </div>
          </div>

          {/* RECURRING EXPENSES TABLE */}
          <div className="bg-white  rounded-3xl border border-slate-200/80  shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50  text-slate-600  font-black uppercase text-[10px] tracking-wider border-b border-slate-200 ">
                  <tr>
                    <th className="py-3.5 px-4 min-w-[220px]">{t("Recurring Expense & Description", "Pravidelný výdavok & Popis", "Rendszeres kiadás & Leírás")}</th>
                    <th className="py-3.5 px-4 min-w-[220px]">{t("Cadence & Next Due", "Frekvencia & Ďalšia platba", "Gyakoriság & Esedékesség")}</th>
                    <th className="py-3.5 px-4 min-w-[200px]">{t("Category Path", "Hierarchia kategórie", "Kategória útvonal")}</th>
                    <th className="py-3.5 px-4 min-w-[150px]">{t("Linked Entity", "Prepojenie", "Kapcsolódó elem")}</th>
                    <th className="py-3.5 px-4 w-[160px] text-right">{t("Cost / Month", "Suma / Mesiac", "Összeg / Hó")}</th>
                    <th className="py-3.5 px-4 w-[110px] text-center">{t("Status", "Stav", "Állapot")}</th>
                    <th className="py-3.5 px-4 w-[110px] text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100  font-medium">
                  {filteredRecurringRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 font-medium space-y-3">
                        <RefreshCw className="h-10 w-10 text-slate-300  mx-auto animate-spin-slow" />
                        <div>
                          <p className="text-sm font-bold text-slate-700 ">
                            {t("No recurring expenses found", "Nenašli sa žiadne pravidelné výdavky", "Nincsenek rendszeres kiadások")}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {t("Add your regular rent, software subscriptions, contractor retainers, or utility costs.", "Pridajte nájomné, predplatné softvéru, mzdy alebo fixné prevádzkové náklady.", "Vegyen fel bérleti díjakat, szoftver-előfizetéseket vagy egyéb fix költségeket.")}
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleQuickSeedRecurringExpenses}
                            className="px-3.5 py-1.5 bg-purple-50  hover:bg-purple-100 text-purple-700  text-xs font-bold rounded-xl border border-purple-200  cursor-pointer"
                          >
                            <Sparkles className="h-3.5 w-3.5 inline mr-1" />
                            {t("Load Standard Overhead Templates", "Nahrať vzorové šablóny", "Alapértelmezett sablonok betöltése")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCreateRecurringModal("expense", "global")}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5 inline mr-1" />
                            {t("Create First Rule", "Vytvoriť prvé pravidlo", "Első szabály létrehozása")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRecurringRecords.map((rec) => {
                      const project = projects.find((p) => p.id === rec.projectId);
                      const projectLead = project ? leads.find((l) => l.id === project.leadId || l.id === project.clientId) : null;
                      const pName = projectLead ? `${projectLead.name}` : rec.projectId ? `Projekt ${rec.projectId.slice(0, 8)}` : null;
                      const client = leads.find((l) => l.id === rec.clientId || l.id === project?.clientId || l.id === project?.leadId);
                      const catBreadcrumbs = getCategoryBreadcrumbs(rec.categoryId);
                      const rootCat = catBreadcrumbs[0];
                      const isPaused = isRecurringPaused(rec);
                      const amount = rec.amountReal > 0 ? rec.amountReal : rec.amountPlanned;
                      // What this rule actually charges in the current calendar
                      // month, calendar- and history-aware — the same rule the
                      // KPI cards above use, so the two can never disagree for
                      // the same month (see F2 of the derived-numbers audit).
                      // A flat amount × 52/12 or /12 approximation used to be
                      // shown here instead, right for no month of a weekly rule.
                      const currentMonthStart = `${forecastToday.slice(0, 7)}-01`;
                      const currentMonthDate = new Date(`${forecastToday}T00:00:00.000Z`);
                      const currentMonthEnd = new Date(
                        Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth() + 1, 0)
                      )
                        .toISOString()
                        .slice(0, 10);
                      const monthlyCost = recurringTotalInRange(rec, currentMonthStart, currentMonthEnd);
                      const nextCharge = getNextRecurringDueDate(rec);
                      const cadenceText = getRecurrenceDescription(rec);
                      // Amounts the rule used to charge, so a price rise reads
                      // as "600 since 17.9." instead of silently restating the
                      // months that were paid at 500.
                      const pinnedAmounts = [...(rec.recurringAmountHistory || [])].sort((a, b) =>
                        a.until.localeCompare(b.until)
                      );
                      const priceSince = pinnedAmounts.length
                        ? shiftIsoDate(pinnedAmounts[pinnedAmounts.length - 1].until, 1)
                        : null;

                      return (
                        <tr
                          key={rec.id}
                          className={`hover:bg-slate-50/80  transition-colors group ${
                            isPaused ? "opacity-60 bg-slate-50/30 " : ""
                          }`}
                        >
                          {/* 1. Title & Description */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900  text-sm">
                                {rec.title}
                              </span>
                              {rec.type === "income" && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100  text-emerald-700 ">
                                  {t("Income", "Príjem", "Bevétel")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {rec.invoiceNumber && (
                                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100  text-slate-600  font-semibold">
                                  {rec.invoiceNumber}
                                </span>
                              )}
                              {rec.description && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[240px]" title={rec.description}>
                                  {rec.description}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Cadence & Schedule Details */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50  text-purple-700  border border-purple-200 ">
                                {rec.recurringFrequency || "monthly"}
                              </span>
                              <span className="text-xs font-semibold text-slate-700 ">
                                {cadenceText}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                              {nextCharge ? (
                                <span>
                                  {t("Next:", "Najbližšie:", "Következő:")} {formatDateLocalized(nextCharge.dateStr, userLanguage)}{" "}
                                  <span className={nextCharge.daysLeft <= 3 ? "text-rose-500 font-bold" : "text-slate-500"}>
                                    ({nextCharge.daysLeft === 0 ? t("Today", "Dnes", "Ma") : t(`in ${nextCharge.daysLeft}d`, `o ${nextCharge.daysLeft} dní`, `${nextCharge.daysLeft} nap múlva`)})
                                  </span>
                                </span>
                              ) : (
                                <span>{t("No further charges", "Už sa neúčtuje", "Nincs több terhelés")}</span>
                              )}
                            </div>
                          </td>

                          {/* 3. Category Path */}
                          <td className="py-3.5 px-4">
                            {catBreadcrumbs.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0 shadow-2xs"
                                  style={{ backgroundColor: rootCat?.color || "#f43f5e" }}
                                />
                                {catBreadcrumbs.map((c, idx) => (
                                  <React.Fragment key={c.id}>
                                    {idx > 0 && <span className="text-[10px] text-slate-400">›</span>}
                                    <span
                                      className={`text-[11px] ${
                                        idx === catBreadcrumbs.length - 1
                                          ? "font-bold text-slate-800 "
                                          : "font-normal text-slate-500 "
                                      }`}
                                    >
                                      {c.name}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                {t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
                              </span>
                            )}
                          </td>

                          {/* 4. Linked Entity */}
                          <td className="py-3.5 px-4">
                            {rec.projectId ? (
                              <button
                                type="button"
                                onClick={() => onOpenProject?.(rec.projectId!)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50  hover:bg-indigo-100 text-indigo-700  rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate max-w-[120px]" title={pName || rec.projectId}>
                                  {pName}
                                </span>
                              </button>
                            ) : rec.clientId ? (
                              <button
                                type="button"
                                onClick={() => onOpenClient?.(rec.clientId!)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50  hover:bg-emerald-100 text-emerald-700  rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <User className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate max-w-[120px]" title={client?.name || rec.clientId}>
                                  {client?.name || rec.clientId.slice(0, 8)}
                                </span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                <Globe className="h-3 w-3 text-slate-400 shrink-0" />
                                <span>{t("Global Company", "Globálne firemné", "Globális vállalati")}</span>
                              </span>
                            )}
                          </td>

                          {/* 5. Amount & Monthly Breakdown */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-black text-sm text-rose-600 ">
                              -{money(amount)}
                              {rec.recurringFrequency && rec.recurringFrequency !== "monthly" && (
                                <span className="text-[10px] font-bold text-slate-400 ml-1">
                                  / {rec.recurringFrequency === "weekly" ? t("wk", "týž", "hét") : t("yr", "rok", "év")}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              ≈ -{money(monthlyCost)} / {t("month", "mesiac", "hónap")}
                            </div>
                            {priceSince && (
                              <div
                                className="text-[10px] text-purple-600  font-semibold mt-0.5"
                                title={pinnedAmounts
                                  .map(
                                    (period) =>
                                      `${money(recurringChargeAmount(period))} ${t("until", "do", "eddig")} ${formatDateLocalized(period.until, userLanguage)}`
                                  )
                                  .join("\n")}
                              >
                                {t("since", "od", "ettől")} {formatDateLocalized(priceSince, userLanguage)}
                              </div>
                            )}
                          </td>

                          {/* 6. Active / Paused Switch */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleRecurringActive(rec.id)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 border ${
                                !isPaused
                                  ? "bg-emerald-50  text-emerald-700  border-emerald-200  shadow-2xs"
                                  : "bg-slate-100  text-slate-500 border-slate-200 "
                              }`}
                              title={!isPaused ? t("Click to pause rule", "Kliknutím pozastavíte", "Kattintson a szüneteltetéshez") : t("Click to resume rule", "Kliknutím aktivujete", "Kattintson az aktiváláshoz")}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${!isPaused ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                              <span>{!isPaused ? t("Active", "Aktívne", "Aktív") : t("Paused", "Pozastavené", "Szünetel")}</span>
                            </button>
                          </td>

                          {/* 7. Action buttons */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(rec)}
                                className="p-1.5 hover:bg-slate-100  rounded-lg text-slate-500 hover:text-slate-900  transition-colors cursor-pointer"
                                title={t("Edit recurring expense", "Upraviť pravidlo", "Szerkesztés")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateRecurring(rec)}
                                className="p-1.5 hover:bg-slate-100  rounded-lg text-slate-500 hover:text-slate-900  transition-colors cursor-pointer"
                                title={t("Duplicate rule", "Duplikovať pravidlo", "Másolás")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(rec.id)}
                                className="p-1.5 hover:bg-rose-50  rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title={t("Delete rule", "Vymazať pravidlo", "Törlés")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB CONTENT 5: 3-LEVEL CATEGORY HIERARCHY TREE MANAGER */}
      {activeTab === "categories" && (
        <div className="bg-white  rounded-3xl border border-slate-200/80  shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100  pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900  flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                {t("Movement Categories", "Kategórie finančných pohybov", "Mozgási kategóriák")}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("Organize your financial movement categories across Main Category (L1) ➔ Subcategory (L2) ➔ Sub-subcategory (L3).", "Organizácia finančných tokov a nákladov v 3 úrovniach: Hlavná kategória (L1) ➔ Podkategória (L2) ➔ Pod-podkategória (L3).", "Pénzügyi tételek 3 szintű rendszerezése: Főkategória (L1) ➔ Alkategória (L2) ➔ Al-alkategória (L3).")}
              </p>
            </div>

            {/* Incomes vs Expenses tree switcher */}
            <div className="flex items-center gap-2 bg-slate-100  p-1 rounded-2xl">
              <button
                onClick={() => {
                  // A parent id from the tree just left behind must not survive
                  // the switch — it would be silently invisible in the "Parent
                  // Category" select (its option belongs to the other type) while
                  // still being submitted, putting the new category's money on
                  // the wrong side of the ledger (see F1).
                  setCatTreeType("expense");
                  setNewCatParentId("");
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  catTreeType === "expense" ? "bg-white  text-rose-600 shadow-sm" : "text-slate-500"
                }`}
              >
                {t("Expense Categories", "Kategórie výdavkov", "Kiadási kategóriák")}
              </button>
              <button
                onClick={() => {
                  setCatTreeType("income");
                  setNewCatParentId("");
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  catTreeType === "income" ? "bg-white  text-emerald-600 shadow-sm" : "text-slate-500"
                }`}
              >
                {t("Income Categories", "Kategórie príjmov", "Bevételi kategóriák")}
              </button>
            </div>
          </div>

          {/* Quick Add Category Form */}
          <form onSubmit={handleCreateCategory} className="p-4 rounded-2xl bg-slate-50  border border-slate-200  flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                {t("Category Name", "Názov kategórie", "Kategória neve")}
              </label>
              <input
                type="text"
                maxLength={150}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={t("e.g. Meta Ads, Truck Transport, LAM 5+...", "napr. Meta Ads, Preprava, LAM 5+...", "pl. Google Ads, Szállítás...")}
                className="w-full px-3 py-2 bg-white  border border-slate-200  rounded-xl text-xs text-slate-800  focus:outline-none"
              />
            </div>

            <div className="min-w-[220px]">
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                {t("Parent Category (optional)", "Nadradená kategória (voliteľné)", "Szülő kategória (opcionális)")}
              </label>
              <CustomSelect
                value={newCatParentId}
                onChange={(val) => setNewCatParentId(val)}
                options={[
                  { value: "", label: t("★ None (Create as Level 1 Root)", "★ Žiadna (Vytvoriť ako Hlavnú L1)", "★ Nincs (Fő L1 kategória)") },
                  ...(catTreeType === "expense" ? categoryTree.expenseTree : categoryTree.incomeTree).flatMap((l1) => [
                    { value: l1.id, label: `● ${l1.name} (L1)` },
                    ...l1.children.map((l2) => ({ value: l2.id, label: `  ↳ ${l2.name} (L2)` })),
                  ]),
                ]}
                size="sm"
                className="w-full text-xs font-semibold rounded-xl bg-white border-slate-200"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                {newCatParentId && !newCatColorTouched ? t("Color (inherited)", "Farba (zdedená)", "Szín (örökölt)") : t("Color", "Farba", "Szín")}
              </label>
              <ColorPicker
                variant="field"
                value={newCatFormColor}
                onChange={(color) => {
                  setNewCatColor(color);
                  setNewCatColorTouched(true);
                }}
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm"
            >
              {t("Add Category", "Pridať kategóriu", "Kategória hozzáadása")}
            </button>
          </form>

          {/* Tree Rendering: every row drags — onto a row's edge to sit beside it, onto its middle to go under it */}
          <p className="-mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
            <GripVertical className="h-3.5 w-3.5 shrink-0" />
            {t(
              "Drag a category to reorder it or move it under another one; click its colour dot to recolour it.",
              "Potiahnutím kategórie zmeníte poradie alebo ju presuniete pod inú; kliknutím na farebnú bodku zmeníte farbu.",
              "Húzással átrendezheti vagy más kategória alá helyezheti; a színes pontra kattintva módosíthatja a színét."
            )}
          </p>
          <div
            ref={categoryTreeRef}
            className="space-y-3"
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCategoryDropTarget(null);
            }}
          >
            {(catTreeType === "expense" ? categoryTree.expenseTree : categoryTree.incomeTree).map((l1) => (
              <div key={l1.id} className="border border-slate-200  rounded-2xl overflow-hidden bg-white ">
                {/* Level 1 Header */}
                {renderCategoryRow(l1, 1)}

                {/* Level 2 Children */}
                {l1.children.length > 0 && (
                  <div className="p-3 space-y-2 bg-slate-50/30 ">
                    {l1.children.map((l2) => (
                      <div key={l2.id} className="pl-4 border-l-2 border-slate-200  space-y-2">
                        {renderCategoryRow(l2, 2, categoryColor(l1))}

                        {/* Level 3 Children */}
                        {l2.children.length > 0 && (
                          <div className="pl-6 space-y-1">
                            {l2.children.map((l3) => renderCategoryRow(l3, 3, categoryColor(l2) || categoryColor(l1)))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Drop zone: the end of the main categories */}
            {draggedCategoryId && (
              <div
                onDragOver={(e) => handleCategoryDragOver(e, null)}
                onDrop={handleCategoryDrop}
                className={`animate-in fade-in slide-in-from-bottom-1 duration-200 rounded-2xl border-2 border-dashed px-4 py-3 text-center text-xs font-semibold transition-colors ${
                  categoryDropTarget?.targetId === null
                    ? "border-indigo-400 bg-indigo-50 text-indigo-600"
                    : "border-slate-200 text-slate-400"
                }`}
              >
                {t(
                  "Drop here to make it a main category (L1) at the end",
                  "Pustite sem — stane sa hlavnou kategóriou (L1) na konci zoznamu",
                  "Engedje el ide — fő kategória (L1) lesz a lista végén"
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9A. EDIT TRANSACTION: RIGHT SLIDEOUT DRAWER PANEL (ENTITIES WITHOUT SEPARATE VIEW) */}
      {isModalOpen && (editingRecord || editingOccurrence) && (
        <div className="fixed inset-0 z-[9999] flex justify-end overflow-hidden">
          {/* Backdrop overlay */}
          <div
            className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ${
              isClosingModal ? "opacity-0" : "opacity-100"
            }`}
            onClick={handleCloseModal}
          />

          {/* Right Slideout Drawer Panel with genuine smooth slide physics */}
          <div
            className={`relative z-10 w-full max-w-xl bg-white  shadow-2xl border-l border-slate-200  flex flex-col h-full overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isClosingModal ? "translate-x-full" : "translate-x-0"
            }`}
          >
            {/* Drawer Header (Fixed at top) */}
            <div className="px-6 py-4 border-b border-slate-100  flex items-center justify-between bg-slate-50/80  shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${
                    formType === "income"
                      ? "bg-emerald-500/10 text-emerald-600  "
                      : "bg-rose-500/10 text-rose-600  "
                  }`}
                >
                  {formType === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 ">
                      {editingOccurrence
                        ? t("Edit payment", "Upraviť platbu", "Fizetés szerkesztése")
                        : editingRecord?.isRecurring
                          ? t("Edit recurring movement", "Upraviť pravidelný pohyb", "Ismétlődő tétel szerkesztése")
                          : formType === "income"
                            ? t("Edit Income / Invoice", "Upraviť príjem / faktúru", "Bevétel / számla szerkesztése")
                            : t("Edit Expense", "Upraviť výdavok", "Kiadás szerkesztése")}
                    </h3>
                    {(formIsRecurring || editingOccurrence) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100  text-purple-700  border border-purple-200 ">
                        {editingOccurrence
                          ? formatDateLocalized(editingOccurrence.date, userLanguage)
                          : t("Recurring", "Pravidelné", "Ismétlődő")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {editingOccurrence
                      ? t(
                          "One payment of a recurring movement: its day, amounts and status. The rule is edited on the Recurring tab.",
                          "Jedna platba pravidelného pohybu: jej deň, sumy a stav. Pravidlo sa upravuje v záložke Pravidelné.",
                          "Az ismétlődő tétel egy fizetése: napja, összegei és állapota. A szabály az Ismétlődő fülön szerkeszthető."
                        )
                      : editingRecord?.isRecurring
                        ? t(
                            "Title, category, amount and schedule — set once for every payment the rule makes.",
                            "Názov, kategória, suma a plán opakovania — nastavené raz pre každú platbu pravidla.",
                            "Név, kategória, összeg és ütemezés — egyszer beállítva a szabály minden fizetésére."
                          )
                        : t(
                            "Update transaction values and 3-level categories.",
                            "Úprava finančného záznamu a kategórie.",
                            "Tétel és kategória adatainak módosítása."
                          )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-700  hover:bg-slate-100  rounded-xl transition-colors cursor-pointer"
                title={t("Close panel", "Zavrieť panel", "Bezárás")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="transaction-edit-form" onSubmit={handleSaveTransaction} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              {editingOccurrence ? renderOccurrenceFormFields() : renderTransactionFormFields()}
            </form>

            {/* Sticky Actions Footer */}
            <div className="px-6 py-4 border-t border-slate-100  bg-slate-50/80  flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2.5 text-xs font-bold text-slate-600  hover:bg-slate-200/70  rounded-xl transition-colors cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégsem")}
              </button>
              <button
                type="submit"
                form="transaction-edit-form"
                className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-all ${
                  formType === "income"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                }`}
              >
                {t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9B. CREATE TRANSACTION: CENTER POPUP MODAL */}
      {isModalOpen && !editingRecord && !editingOccurrence && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop overlay */}
          <div
            className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 ${
              isClosingModal ? "opacity-0" : "opacity-100"
            }`}
            onClick={handleCloseModal}
          />

          {/* Center Modal Card */}
          <div
            className={`relative z-10 bg-white  rounded-3xl border border-slate-200  shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden transition-all duration-200 ${
              isClosingModal ? "scale-95 opacity-0" : "scale-100 opacity-100"
            }`}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100  flex items-center justify-between bg-slate-50/80  shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${
                    formType === "income"
                      ? "bg-emerald-500/10 text-emerald-600  "
                      : "bg-rose-500/10 text-rose-600  "
                  }`}
                >
                  {formType === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 ">
                      {formType === "income"
                        ? t("Add New Income / Invoice", "Pridať nový príjem / faktúru", "Új bevétel / számla hozzáadása")
                        : t("Add New Expense", "Pridať nový výdavok", "Új kiadás hozzáadása")}
                    </h3>
                    {formIsRecurring && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100  text-purple-700  border border-purple-200 ">
                        {t("Recurring", "Pravidelné", "Ismétlődő")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t(
                      "Specify planned vs real amounts, scope, recurring schedule, and 3-level categories.",
                      "Zadajte plánovanú a reálnu sumu, rozsah, pravidelnosť a kategóriu.",
                      "Adja meg a tervezett és valós összeget, gyakoriságot és kategóriát."
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-700  hover:bg-slate-100  rounded-xl transition-colors cursor-pointer"
                title={t("Close", "Zavrieť", "Bezárás")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="transaction-create-form" onSubmit={handleSaveTransaction} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              {renderTransactionFormFields()}
            </form>

            {/* Actions Footer */}
            <div className="px-6 py-4 border-t border-slate-100  bg-slate-50/80  flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2.5 text-xs font-bold text-slate-600  hover:bg-slate-200/70  rounded-xl transition-colors cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégsem")}
              </button>
              <button
                type="submit"
                form="transaction-create-form"
                className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-all ${
                  formType === "income"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                }`}
              >
                {formType === "income"
                  ? t("Create Income", "Vytvoriť príjem", "Bevétel létrehozása")
                  : t("Create Expense", "Vytvoriť výdavok", "Kiadás létrehozása")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9b. SETTLED-AMOUNT PROMPT (inline status change in the movements ledger) */}
      {statusPrompt && (() => {
        const { record, nextStatus, amount } = statusPrompt;
        const isExpense = record.type === "expense";
        const parsed = parseFloat(amount.replace(",", "."));
        const entered = isFinite(parsed) ? parsed : 0;
        const remaining = Math.round((record.amountPlanned - entered) * 100) / 100;

        return (
          <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <form
              onSubmit={handleConfirmStatusAmount}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200"
            >
              {/* Header */}
              <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3 border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2.5 rounded-2xl shrink-0 ${
                      nextStatus === "paid"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-sky-500/10 text-sky-600"
                    }`}
                  >
                    {nextStatus === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900">
                      {nextStatus === "paid"
                        ? t("Mark as paid", "Označiť ako uhradené", "Megjelölés fizetettként")
                        : t("Record a partial payment", "Zaznamenať čiastočnú úhradu", "Részleges fizetés rögzítése")}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 truncate" title={record.title}>
                      {record.title}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStatusPrompt(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
                  title={t("Close panel", "Zatvoriť panel", "Bezárás")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {t("Planned amount", "Plánovaná suma", "Tervezett összeg")}
                  </span>
                  <span className={`text-sm font-black ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
                    {isExpense ? "-" : "+"}{money(record.amountPlanned)}
                  </span>
                </div>

                <div>
                  <label htmlFor="status-prompt-amount" className="text-xs font-bold text-slate-700 block mb-1">
                    {nextStatus === "paid"
                      ? t("Amount actually paid", "Skutočne uhradená suma", "Tényleges fizetett összeg")
                      : t("Amount paid so far", "Doteraz uhradená suma", "Eddig fizetett összeg")}
                  </label>
                  <input
                    id="status-prompt-amount"
                    ref={statusPromptInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    value={amount}
                    onChange={(e) => setStatusPrompt({ ...statusPrompt, amount: e.target.value })}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 transition-all duration-150 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {t(
                      "This is written to the movement as its real amount.",
                      "Táto suma sa zapíše do pohybu ako reálna suma.",
                      "Ez az összeg kerül a tételbe valós összegként."
                    )}
                  </p>
                </div>

                {nextStatus === "partially_paid" && entered > 0 && (
                  <div
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl border text-xs font-bold ${
                      remaining > 0
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    <span className="uppercase tracking-wider">
                      {remaining > 0
                        ? t("Still outstanding", "Zostáva doplatiť", "Még hátralévő")
                        : t("Nothing outstanding", "Nezostáva nič doplatiť", "Nincs hátralék")}
                    </span>
                    <span className="font-black">{money(Math.max(remaining, 0))}</span>
                  </div>
                )}

                {!record.paidDate && (
                  <p className="text-[11px] text-slate-400">
                    {t(
                      `The payment date is set to today (${formatDateLocalized(todayLocal(), userLanguage)}) — edit the movement to change it.`,
                      `Dátum úhrady sa nastaví na dnes (${formatDateLocalized(todayLocal(), userLanguage)}) — zmeníte ho v úprave pohybu.`,
                      `A fizetés dátuma a mai nap lesz (${formatDateLocalized(todayLocal(), userLanguage)}) — a tétel szerkesztésével módosítható.`
                    )}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStatusPrompt(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer active:scale-[0.98]"
                >
                  {t("Cancel", "Zrušiť", "Mégsem")}
                </button>
                <button
                  type="submit"
                  className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-all duration-150 active:scale-[0.98] ${
                    nextStatus === "paid"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      : "bg-sky-600 hover:bg-sky-700 shadow-sky-600/20"
                  }`}
                >
                  {nextStatus === "paid"
                    ? t("Confirm payment", "Potvrdiť úhradu", "Fizetés megerősítése")
                    : t("Save partial payment", "Uložiť čiastočnú úhradu", "Részleges fizetés mentése")}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* 10. CATEGORY TREE MANAGEMENT MODAL */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white  rounded-3xl border border-slate-200  shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100  pb-3">
              <h3 className="text-sm font-bold text-slate-900  flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                {t("Manage 3-Level Categories", "Správa kategórií (3 úrovne)", "3 szintű kategóriák")}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {t("You can manage categories under the '3-Level Category Tree' tab or add subcategories directly.", "Kategórie môžete spravovať v záložke 'Strom kategórií'.", "A kategóriák kezelhetők a 'Kategória-fa' fül alatt.")}
            </p>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  setIsCatModalOpen(false);
                  handleTabChange("categories");
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {t("Open Full Category Tree Manager", "Otvoriť strom kategórií", "Kategória-fa megnyitása")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
