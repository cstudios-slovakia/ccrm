import React, { useState, useMemo, useEffect } from "react";
import {
  Calculator,
  ChevronDown,
  RotateCcw,
  XCircle,
  Layers,
  Briefcase,
  Receipt,
  Plus,
  Equal,
  Eye,
  EyeOff,
  Info,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import { formatMoney } from "../utils/currency";
import { readableOn } from "../utils/accentColor";
import type { Language } from "../utils/translations";

export interface StatusStatDetailRow {
  id: string;
  name: string;
  clientName?: string;
  manager?: string;
  division?: string | null;
  date?: string;
  totalBudget?: number;
  invoiced?: number;
  invoicable: number;
  type: "lead" | "project";
  url?: string;
}

export interface StatusStatItem {
  key: string;
  name: string;
  value: number; // Always the invoicable value!
  count: number;
  color?: string;
  totalBudget?: number;
  invoiced?: number;
  rows?: StatusStatDetailRow[];
}

export interface ExtraHighlightMetric {
  label: string;
  value: number;
  subtext?: string;
  color?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface StatusStatGroup {
  id: string;
  name: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  colorTheme?: "blue" | "purple" | "indigo" | "emerald" | "amber" | "yellow" | "cyan";
  items: StatusStatItem[];
  unitLabel?: string;
  extraHighlight?: ExtraHighlightMetric;
}

export interface GroupedStatusValueEquationStatsProps {
  groups: StatusStatGroup[];
  currency?: string | null;
  language: Language;
  title?: string;
  subtitle?: string;
  storageKey?: string;
  defaultExpanded?: boolean;
}

interface DrawerData {
  groupName: string;
  groupColor: string;
  itemName: string;
  itemColor: string;
  itemValue: number;
  itemCount: number;
  totalBudget?: number;
  invoiced?: number;
  rows: StatusStatDetailRow[];
}

export const GroupedStatusValueEquationStats: React.FC<GroupedStatusValueEquationStatsProps> = ({
  groups,
  currency,
  language = "sk",
  title,
  subtitle,
  storageKey = "ccrm_dashboard_equation_stats",
  defaultExpanded = true,
}) => {
  const resolvedCurrency = currency || "EUR";

  // Read initial expanded state from localStorage
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`${storageKey}_expanded`);
        if (saved !== null) return saved === "true";
      } catch {
        // ignore storage errors
      }
    }
    return defaultExpanded;
  });

  // Read initial disabled keys from localStorage (scoped as `${groupId}:${itemKey}`)
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`${storageKey}_disabled`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      } catch {
        // ignore storage errors
      }
    }
    return new Set();
  });

  // Slideout drawer state
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const [drawerSearch, setDrawerSearch] = useState<string>("");

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerData(null);
      }
    };
    if (drawerData) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerData]);

  // Persist expanded state
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(`${storageKey}_expanded`, String(isExpanded));
      } catch {
        // ignore storage errors
      }
    }
  }, [isExpanded, storageKey]);

  // Persist disabled keys
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(
          `${storageKey}_disabled`,
          JSON.stringify(Array.from(disabledKeys))
        );
      } catch {
        // ignore storage errors
      }
    }
  }, [disabledKeys, storageKey]);

  const toggleStatus = (groupId: string, itemKey: string) => {
    const fullKey = `${groupId}:${itemKey}`;
    setDisabledKeys((prev) => {
      const next = new Set(prev);
      if (next.has(fullKey)) {
        next.delete(fullKey);
      } else {
        next.add(fullKey);
      }
      return next;
    });
  };

  const enableAll = () => {
    setDisabledKeys(new Set());
  };

  const disableAll = () => {
    const allKeys = new Set<string>();
    groups.forEach((g) => {
      g.items.forEach((item) => {
        allKeys.add(`${g.id}:${item.key}`);
      });
    });
    setDisabledKeys(allKeys);
  };

  const t = (en: string, sk: string, hu: string) => {
    if (language === "hu") return hu;
    if (language === "sk") return sk;
    return en;
  };

  // Group theme configurations
  const groupThemes: Record<
    string,
    {
      containerBg: string;
      containerBorder: string;
      headerBg: string;
      headerText: string;
      iconBg: string;
      iconText: string;
      subtotalBadge: string;
    }
  > = {
    blue: {
      containerBg: "bg-gradient-to-br from-blue-50/70 via-white/80 to-sky-50/50",
      containerBorder: "border-blue-200/80 shadow-xs",
      headerBg: "bg-blue-100/70",
      headerText: "text-blue-900",
      iconBg: "bg-blue-600 text-white shadow-blue-600/25",
      iconText: "text-blue-600",
      subtotalBadge: "bg-blue-600 text-white shadow-blue-600/20",
    },
    purple: {
      containerBg: "bg-gradient-to-br from-purple-50/70 via-white/80 to-indigo-50/50",
      containerBorder: "border-purple-200/80 shadow-xs",
      headerBg: "bg-purple-100/70",
      headerText: "text-purple-900",
      iconBg: "bg-purple-600 text-white shadow-purple-600/25",
      iconText: "text-purple-600",
      subtotalBadge: "bg-purple-600 text-white shadow-purple-600/20",
    },
    indigo: {
      containerBg: "bg-gradient-to-br from-indigo-50/70 via-white/80 to-slate-50/50",
      containerBorder: "border-indigo-200/80 shadow-xs",
      headerBg: "bg-indigo-100/70",
      headerText: "text-indigo-900",
      iconBg: "bg-indigo-600 text-white shadow-indigo-600/25",
      iconText: "text-indigo-600",
      subtotalBadge: "bg-indigo-600 text-white shadow-indigo-600/20",
    },
    emerald: {
      containerBg: "bg-gradient-to-br from-emerald-50/70 via-white/80 to-teal-50/50",
      containerBorder: "border-emerald-200/80 shadow-xs",
      headerBg: "bg-emerald-100/70",
      headerText: "text-emerald-900",
      iconBg: "bg-emerald-600 text-white shadow-emerald-600/25",
      iconText: "text-emerald-600",
      subtotalBadge: "bg-emerald-600 text-white shadow-emerald-600/20",
    },
    amber: {
      containerBg: "bg-gradient-to-br from-amber-50/70 via-white/80 to-yellow-50/50",
      containerBorder: "border-amber-200/80 shadow-xs",
      headerBg: "bg-amber-100/70",
      headerText: "text-amber-900",
      iconBg: "bg-amber-600 text-white shadow-amber-600/25",
      iconText: "text-amber-600",
      subtotalBadge: "bg-amber-600 text-white shadow-amber-600/20",
    },
    yellow: {
      containerBg: "bg-gradient-to-br from-yellow-50/70 via-white/80 to-amber-50/50",
      containerBorder: "border-yellow-200/80 shadow-xs",
      headerBg: "bg-yellow-100/70",
      headerText: "text-yellow-900",
      iconBg: "bg-amber-500 text-white shadow-amber-500/25",
      iconText: "text-amber-600",
      subtotalBadge: "bg-amber-500 text-white shadow-amber-500/20",
    },
    cyan: {
      containerBg: "bg-gradient-to-br from-cyan-50/70 via-white/80 to-blue-50/50",
      containerBorder: "border-cyan-200/80 shadow-xs",
      headerBg: "bg-cyan-100/70",
      headerText: "text-cyan-900",
      iconBg: "bg-cyan-600 text-white shadow-cyan-600/25",
      iconText: "text-cyan-600",
      subtotalBadge: "bg-cyan-600 text-white shadow-cyan-600/20",
    },
  };

  // Group calculations
  const calculatedGroups = useMemo(() => {
    return groups.map((group) => {
      const enabledItems = group.items.filter(
        (item) => !disabledKeys.has(`${group.id}:${item.key}`)
      );
      const subtotalValue = enabledItems.reduce(
        (sum, item) => sum + (Number(item.value) || 0),
        0
      );
      const subtotalCount = enabledItems.reduce(
        (sum, item) => sum + (Number(item.count) || 0),
        0
      );
      const allGroupItems = group.items;
      const totalGroupValue = allGroupItems.reduce(
        (sum, item) => sum + (Number(item.value) || 0),
        0
      );
      const totalGroupCount = allGroupItems.reduce(
        (sum, item) => sum + (Number(item.count) || 0),
        0
      );

      return {
        ...group,
        enabledItems,
        subtotalValue,
        subtotalCount,
        totalGroupValue,
        totalGroupCount,
        allEnabled: enabledItems.length === allGroupItems.length,
        hasDisabled: enabledItems.length < allGroupItems.length,
      };
    });
  }, [groups, disabledKeys]);

  // Grand total calculation across all groups
  const grandTotalValue = useMemo(() => {
    return calculatedGroups.reduce((sum, g) => sum + g.subtotalValue, 0);
  }, [calculatedGroups]);

  const grandTotalCount = useMemo(() => {
    return calculatedGroups.reduce((sum, g) => sum + g.subtotalCount, 0);
  }, [calculatedGroups]);

  const totalPossibleItemsCount = useMemo(() => {
    return groups.reduce((sum, g) => sum + g.items.length, 0);
  }, [groups]);

  const filteredDrawerRows = useMemo(() => {
    if (!drawerData || !drawerData.rows) return [];
    const q = drawerSearch.toLowerCase().trim();
    if (!q) return drawerData.rows;
    return drawerData.rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.clientName && r.clientName.toLowerCase().includes(q)) ||
        (r.manager && r.manager.toLowerCase().includes(q)) ||
        (r.division && r.division.toLowerCase().includes(q))
    );
  }, [drawerData, drawerSearch]);

  const hasAnyItems = totalPossibleItemsCount > 0;
  if (!hasAnyItems) return null;

  const hasDisabledAnywhere = disabledKeys.size > 0;

  const defaultTitle = t(
    "Combined Pipeline & Projects Invoicable Breakdown",
    "Kombinovaný prehľad hodnôt na fakturovanie",
    "Összevont számlázható értékek összesítése"
  );
  const defaultSubtitle = t(
    "Interactive status value equation (only invoicable values) with slideout inspection",
    "Interaktívny súčet hodnôt na fakturovanie s možnosťou detailnej inšpekcie položiek",
    "Interaktív számlázható értékösszesítő részletes tételes áttekintéssel"
  );

  return (
    <>
      <div className="glass-panel rounded-[26px] border border-slate-200/90 bg-white/90 shadow-glass transition-all duration-300 overflow-hidden select-none">
        {/* 1. Header Bar / Quick Expand-Collapse Toggle */}
        <div
          onClick={() => setIsExpanded((prev) => !prev)}
          className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-white/60 transition-colors border-b border-slate-100"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
              <Calculator className="h-4.5 w-4.5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-heading font-black text-slate-900 uppercase tracking-tight">
                  {title || defaultTitle}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 border border-slate-200 text-slate-700 uppercase tracking-wider shadow-2xs">
                  {groups.length} {t("groups", "skupiny", "csoport")} · {totalPossibleItemsCount}{" "}
                  {t("statuses", "stavov", "állapot")}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate max-w-xl hidden sm:block">
                {subtitle || defaultSubtitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Quick collapsed preview chips */}
            {!isExpanded && (
              <div className="flex items-center gap-2 flex-wrap">
                {calculatedGroups.map((g) => {
                  const theme = groupThemes[g.colorTheme || "blue"] || groupThemes.blue;
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${theme.headerBg} border ${theme.containerBorder} shadow-2xs`}
                    >
                      <span className="text-[9px] font-black uppercase text-slate-600">
                        {g.name}:
                      </span>
                      <span className="text-xs font-black text-slate-900 tabular-nums">
                        {formatMoney(g.subtotalValue, resolvedCurrency, language, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  );
                })}

                {/* Remaining Invoicable teaser badge */}
                {calculatedGroups.map((g) =>
                  g.extraHighlight ? (
                    <div
                      key={`teaser-${g.id}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 shadow-2xs"
                    >
                      <Receipt className="h-3 w-3 text-amber-600" />
                      <span className="text-[9px] font-black uppercase">
                        {t("Remaining:", "Zostáva:", "Hátralévő:")}
                      </span>
                      <span className="text-xs font-black text-amber-950 tabular-nums">
                        {formatMoney(g.extraHighlight.value, resolvedCurrency, language, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ) : null
                )}

                {/* Grand Total pill */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm shadow-emerald-600/20">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">
                    {t("Total Invoicable:", "Spolu na fakturáciu:", "Összes számlázható:")}
                  </span>
                  <span className="text-xs font-black text-white tabular-nums">
                    {formatMoney(grandTotalValue, resolvedCurrency, language, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            )}

            {/* Quick toggle button */}
            <button
              type="button"
              className="h-8 px-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
            >
              <span>{isExpanded ? t("Collapse", "Zbaliť", "Összecsukás") : t("Expand", "Rozbaliť", "Kibontás")}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-300 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* 2. Expanded Content: Grouped Containers + Equation Total */}
        {isExpanded && (
          <div className="p-5 space-y-5 animate-fade-in bg-slate-50/40">
            {/* Quick Toolbar: Select All / Deselect All / Reset */}
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t(
                    "Interactive status toggles:",
                    "Interaktívne prepínače stavov:",
                    "Interaktív állapotkapcsolók:"
                  )}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  ({t("click Eye icon or badge to include/exclude; click (i) to inspect calculated items", "kliknutím na Oko/odznak zahrniete/vylúčite; kliknutím na (i) zobrazíte položky", "Kattintson a Szemre/jelvényre a ki/bekapcsoláshoz; kattintson az (i)-re a tételekhez")})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {hasDisabledAnywhere && (
                  <button
                    type="button"
                    onClick={enableAll}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                    title={t("Include all statuses", "Zahrnúť všetky stavy", "Összes állapot bekapcsolása")}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{t("Select all", "Vybrať všetko", "Összes kijelölése")}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={disableAll}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                  title={t("Exclude all statuses", "Vylúčiť všetky stavy", "Összes kizárása")}
                >
                  <XCircle className="h-3 w-3" />
                  <span>{t("Clear all", "Zrušiť všetko", "Minden törlése")}</span>
                </button>
              </div>
            </div>

            {/* Group Containers Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {calculatedGroups.map((group) => {
                const theme = groupThemes[group.colorTheme || "blue"] || groupThemes.blue;
                const GroupIcon = group.icon || (group.id === "leads" ? Layers : Briefcase);

                return (
                  <div
                    key={group.id}
                    className={`rounded-2xl border ${theme.containerBorder} ${theme.containerBg} p-4.5 flex flex-col justify-between gap-4 transition-all`}
                  >
                    {/* Group Header */}
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`h-8 w-8 rounded-xl ${theme.iconBg} flex items-center justify-center shadow-xs shrink-0`}
                        >
                          <GroupIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-tight">
                              {group.name}
                            </h3>
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-white/90 border border-slate-200/80 text-slate-600">
                              {group.items.length} {group.unitLabel || t("statuses", "stavov", "állapot")}
                            </span>
                          </div>
                          {group.subtitle && (
                            <p className="text-[10px] font-semibold text-slate-500">
                              {group.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Group Subtotal Badge */}
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          {t("Group Invoicable", "Medzisúčet na fakturáciu", "Részösszeg számlázható")}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm font-heading font-black text-slate-900 tabular-nums">
                            {formatMoney(group.subtotalValue, resolvedCurrency, language, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 shadow-2xs">
                            {group.subtotalCount} {t("items", "pol.", "db")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pills with Equation Operators */}
                    <div className="flex flex-wrap items-center gap-2">
                      {group.items.map((item, itemIdx) => {
                        const isDisabled = disabledKeys.has(`${group.id}:${item.key}`);
                        const isEnabled = !isDisabled;
                        const pillBgColor = item.color || "#3b82f6";
                        const pillTextColor = readableOn(pillBgColor);

                        return (
                          <React.Fragment key={item.key}>
                            {itemIdx > 0 && (
                              <span
                                className={`text-xs font-black transition-opacity ${
                                  isEnabled ? "text-slate-400" : "text-slate-300 opacity-40"
                                }`}
                              >
                                +
                              </span>
                            )}

                            <div
                              onClick={() => toggleStatus(group.id, item.key)}
                              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold text-xs shadow-2xs transition-all duration-200 cursor-pointer active:scale-98 ${
                                isEnabled
                                  ? "shadow-sm hover:brightness-105"
                                  : "bg-slate-100 text-slate-400 border-slate-200 opacity-40 hover:opacity-60 line-through"
                              }`}
                              style={
                                isEnabled
                                  ? {
                                      backgroundColor: pillBgColor,
                                      borderColor: pillBgColor,
                                      color: pillTextColor,
                                    }
                                  : undefined
                              }
                              title={`${item.name}: ${formatMoney(
                                item.value,
                                resolvedCurrency,
                                language
                              )} (${item.count}) — ${
                                isEnabled
                                  ? t("Click to exclude / hide", "Kliknutím skryjete / vylúčite", "Kattintson az elrejtéshez")
                                  : t("Click to include / show", "Kliknutím zobrazíte / zahrniete", "Kattintson a megjelenítéshez")
                              }`}
                            >
                              {/* 1. Show/Hide Eye Icon */}
                              <span
                                className="flex items-center justify-center p-0.5 rounded-md hover:bg-black/15 transition-colors"
                                title={
                                  isEnabled
                                    ? t("Click to hide / exclude", "Kliknutím skryjete / vylúčite", "Kattintson az elrejtéshez")
                                    : t("Click to show / include", "Kliknutím zobrazíte / zahrniete", "Kattintson a megjelenítéshez")
                                }
                              >
                                {isEnabled ? (
                                  <Eye className="h-3.5 w-3.5 stroke-[2.5]" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5 stroke-[2.5]" />
                                )}
                              </span>

                              {/* Status Name */}
                              <span className="font-heading font-black tracking-tight text-[11px] uppercase">
                                {item.name}
                              </span>

                              {/* Invoicable Amount */}
                              <span
                                className="font-extrabold tabular-nums text-[11px]"
                                style={isEnabled ? { color: pillTextColor } : undefined}
                              >
                                {formatMoney(item.value, resolvedCurrency, language, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </span>

                              {/* Count badge */}
                              <span
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                  isEnabled
                                    ? "bg-black/20 text-white"
                                    : "bg-slate-200 text-slate-500"
                                }`}
                              >
                                {item.count}
                              </span>

                              {/* 2. Info Icon Button (Opens Right Slideout) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDrawerSearch("");
                                  setDrawerData({
                                    groupName: group.name,
                                    groupColor: group.colorTheme || "blue",
                                    itemName: item.name,
                                    itemColor: pillBgColor,
                                    itemValue: item.value,
                                    itemCount: item.count,
                                    totalBudget: item.totalBudget,
                                    invoiced: item.invoiced,
                                    rows: item.rows || [],
                                  });
                                }}
                                className="ml-0.5 flex items-center justify-center h-5 w-5 rounded-full hover:bg-black/25 active:scale-90 transition-all cursor-pointer"
                                title={t(
                                  "Inspect calculated leads / projects",
                                  "Zobraziť zoznam kalkulovaných obchodov/projektov",
                                  "Kalkulált tételek részletes megtekintése"
                                )}
                              >
                                <Info className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Optional Extra Highlight Card (Always show Remaining Invoicable on Projects) */}
                    {group.extraHighlight && (
                      <div className="mt-1 pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 rounded-xl p-3 border border-amber-200/80 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                            <Receipt className="h-4 w-4 stroke-[2.5]" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                              {group.extraHighlight.label}
                              <span className="px-1.5 py-0.2 rounded-full text-[8px] font-extrabold bg-amber-100 text-amber-800 uppercase">
                                {t("Active Scope", "Aktívny rozsah", "Aktív hatókör")}
                              </span>
                            </span>
                            {group.extraHighlight.subtext && (
                              <p className="text-[9.5px] font-semibold text-slate-500 truncate mt-0.5">
                                {group.extraHighlight.subtext}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-baseline gap-1.5 shrink-0 self-end sm:self-auto">
                          <span className="text-base font-heading font-black text-amber-950 tabular-nums">
                            {formatMoney(group.extraHighlight.value, resolvedCurrency, language, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 3. Grand Equation Total Bar */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
              {/* Equation formula visualization */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center lg:justify-start">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                  {t("Total Invoicable Equation:", "Súčet rovnice na fakturáciu:", "Összesítő számlázási egyenlet:")}
                </span>

                {calculatedGroups.map((g, idx) => (
                  <React.Fragment key={`eq-${g.id}`}>
                    {idx > 0 && <Plus className="h-4 w-4 text-slate-400 stroke-[3]" />}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-[10px] font-black uppercase text-slate-600">
                        {g.name}:
                      </span>
                      <span className="text-xs font-black text-slate-900 tabular-nums">
                        {formatMoney(g.subtotalValue, resolvedCurrency, language, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </React.Fragment>
                ))}

                <Equal className="h-4 w-4 text-slate-400 stroke-[3]" />
              </div>

              {/* Grand Total Highlight Badge */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/25">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-200 leading-none">
                      {t("Total Invoicable Active Value", "Celková aktívna hodnota na fakturovanie", "Teljes aktív számlázható összeg")}
                    </span>
                    <span className="text-lg font-heading font-black text-white tabular-nums mt-0.5">
                      {formatMoney(grandTotalValue, resolvedCurrency, language, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-1 rounded-xl bg-white/20 text-white shadow-inner">
                    {grandTotalCount} {t("active items", "aktívnych položiek", "aktív tétel")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Right Slideout Drawer for Inspected Items */}
      {drawerData && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[9999] flex justify-end animate-fade-in"
          onClick={() => setDrawerData(null)}
        >
          <div
            className="w-full max-w-lg sm:max-w-xl bg-white h-full shadow-2xl flex flex-col z-[10000] animate-in slide-in-from-right duration-300 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-10 w-10 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 font-heading font-black text-sm"
                  style={{ backgroundColor: drawerData.itemColor }}
                >
                  {drawerData.itemCount}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      {drawerData.groupName}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase text-white shadow-2xs"
                      style={{ backgroundColor: drawerData.itemColor }}
                    >
                      {drawerData.itemName}
                    </span>
                  </div>
                  <h3 className="text-base font-heading font-black text-slate-900 truncate mt-0.5">
                    {t("Calculated Items Breakdown", "Prehľad kalkulovaných položiek", "Kalkulált tételek részletei")}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {t("Invoicable in this status:", "Hodnota na fakturovanie v tomto stave:", "Számlázható összeg:")}{" "}
                    <span className="font-bold text-emerald-700 font-heading">
                      {formatMoney(drawerData.itemValue, resolvedCurrency, language, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerData(null)}
                className="h-8 w-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shadow-2xs shrink-0"
              >
                <X className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Budget Breakdown Strip if available */}
            {drawerData.totalBudget !== undefined && drawerData.totalBudget > 0 && (
              <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between gap-3 text-xs shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block">
                      {t("Total Budget", "Celkový rozpočet", "Teljes büdzsé")}
                    </span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatMoney(drawerData.totalBudget, resolvedCurrency, language, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                  {drawerData.invoiced !== undefined && (
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">
                        {t("Invoiced so far", "Vyfakturované", "Számlázva")}
                      </span>
                      <span className="font-bold text-indigo-700 tabular-nums">
                        {formatMoney(drawerData.invoiced, resolvedCurrency, language, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[9px] font-black uppercase text-amber-700 block">
                      {t("Remaining Invoicable", "Zostáva vyfakturovať", "Hátralévő számlázható")}
                    </span>
                    <span className="font-heading font-black text-amber-950 tabular-nums">
                      {formatMoney(drawerData.itemValue, resolvedCurrency, language, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Search Filter Bar */}
            <div className="p-3.5 border-b border-slate-100 bg-white shrink-0">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  placeholder={t(
                    "Filter by name, client, manager, division...",
                    "Filtrovať podľa názvu, klienta, manažéra, divízie...",
                    "Szűrés név, ügyfél, felelős, divízió szerint..."
                  )}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-colors"
                />
                {drawerSearch && (
                  <button
                    type="button"
                    onClick={() => setDrawerSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredDrawerRows.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <p className="text-xs font-semibold">
                    {drawerSearch
                      ? t(
                          "No items matching search query.",
                          "Žiadne položky nezodpovedajú vyhľadávaniu.",
                          "Nincs a keresésnek megfelelő tétel."
                        )
                      : t(
                          "No individual records found in this status.",
                          "V tomto stave sa nenašli žiadne položky.",
                          "Nincsenek tételek ebben az állapotban."
                        )}
                  </p>
                </div>
              ) : (
                filteredDrawerRows.map((row) => (
                  <div
                    key={row.id}
                    className="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-md transition-all flex flex-col gap-2 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              row.type === "project"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {row.type === "project"
                              ? t("Project", "Projekt", "Projekt")
                              : t("Lead", "Lead", "Lead")}
                          </span>
                          {row.division && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {row.division}
                            </span>
                          )}
                          {row.date && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              {row.date}
                            </span>
                          )}
                        </div>

                        <a
                          href={row.url || "#"}
                          onClick={() => setDrawerData(null)}
                          className="text-sm font-heading font-black text-slate-900 hover:text-indigo-600 transition-colors line-clamp-1 block"
                        >
                          {row.name}
                        </a>

                        {row.clientName && (
                          <p className="text-xs font-semibold text-slate-500 truncate mt-0.5">
                            {row.clientName}
                          </p>
                        )}
                      </div>

                      {/* Invoicable Value Badge */}
                      <div className="text-right shrink-0">
                        <span className="text-[9px] font-black uppercase text-slate-400 block">
                          {t("Invoicable", "Na fakturovanie", "Számlázható")}
                        </span>
                        <span className="text-sm font-heading font-black text-emerald-600 tabular-nums">
                          {formatMoney(row.invoicable, resolvedCurrency, language, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Financial Details for Projects with Invoiced vs Budget */}
                    {row.type === "project" && row.totalBudget !== undefined && row.totalBudget > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span>
                          {t("Budget:", "Rozpočet:", "Büdzsé:")}{" "}
                          <b className="text-slate-700 font-bold">
                            {formatMoney(row.totalBudget, resolvedCurrency, language, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </b>
                        </span>
                        <span>
                          {t("Invoiced:", "Vyfakturované:", "Számlázva:")}{" "}
                          <b className="text-indigo-600 font-bold">
                            {formatMoney(row.invoiced || 0, resolvedCurrency, language, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </b>
                        </span>
                        {row.manager && (
                          <span className="text-slate-400 truncate max-w-[120px]">
                            PM: {row.manager}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <a
                        href={row.url || "#"}
                        onClick={() => setDrawerData(null)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                      >
                        <span>{t("Open in CRM", "Otvoriť v CRM", "Megnyitás a CRM-ben")}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="font-semibold text-[11px]">
                {filteredDrawerRows.length} {t("items calculated", "kalkulovaných položiek", "tétel számolva")}
              </span>
              <button
                type="button"
                onClick={() => setDrawerData(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {t("Close", "Zavrieť", "Bezárás")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
