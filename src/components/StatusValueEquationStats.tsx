import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  Calculator,
  RotateCcw,
  XCircle,
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
  value: number; // Always invoicable value!
  count: number;
  color?: string;
  totalBudget?: number;
  invoiced?: number;
  rows?: StatusStatDetailRow[];
}

export interface StatusValueEquationStatsProps {
  items: StatusStatItem[];
  currency?: string | null;
  language: Language;
  title?: string;
  subtitle?: string;
  unitLabel?: string;
  storageKey?: string;
  defaultExpanded?: boolean;
  themeColor?: "blue" | "purple" | "indigo" | "emerald" | "amber" | "yellow" | "cyan";
  totalColor?: "blue" | "purple" | "indigo" | "emerald" | "green" | "amber" | "yellow" | "cyan";
}

interface DrawerData {
  itemName: string;
  itemColor: string;
  itemValue: number;
  itemCount: number;
  totalBudget?: number;
  invoiced?: number;
  rows: StatusStatDetailRow[];
}

export const StatusValueEquationStats: React.FC<StatusValueEquationStatsProps> = ({
  items,
  currency,
  language = "sk",
  title,
  subtitle,
  unitLabel,
  storageKey,
  defaultExpanded = true,
  themeColor = "blue",
  totalColor,
}) => {
  const resolvedCurrency = currency || "EUR";

  // Read initial expanded state from localStorage if available
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

  // Read initial disabled keys from localStorage if available
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

  const toggleStatus = (key: string) => {
    setDisabledKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const enableAll = () => {
    setDisabledKeys(new Set());
  };

  const disableAll = () => {
    setDisabledKeys(new Set(items.map((i) => i.key)));
  };

  const enabledItems = useMemo(
    () => items.filter((item) => !disabledKeys.has(item.key)),
    [items, disabledKeys]
  );

  const totalValue = useMemo(
    () => enabledItems.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [enabledItems]
  );

  const totalCount = useMemo(
    () => enabledItems.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
    [enabledItems]
  );

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

  const t = (en: string, sk: string, hu: string) => {
    if (language === "hu") return hu;
    if (language === "sk") return sk;
    return en;
  };

  const defaultTitle = t(
    "Active Value Breakdown",
    "Prehľad hodnôt aktívnych fáz",
    "Aktív fázisok értékének összesítése"
  );
  const defaultSubtitle = t(
    "Interactive status value equation (only invoicable values) with slideout inspection",
    "Interaktívny súčet hodnôt na fakturovanie s možnosťou detailnej inšpekcie položiek",
    "Interaktív számlázható értékösszesítő részletes tételes áttekintéssel"
  );
  const resolvedUnitLabel =
    unitLabel || t("items", "položiek", "tétel");

  const themeClasses = {
    blue: {
      border: "border-blue-100/90",
      bg: "bg-gradient-to-r from-blue-50/50 via-white/80 to-indigo-50/40",
      iconBg: "bg-blue-600 text-white shadow-blue-600/20",
      pillBorder: "border-blue-200",
      totalBg: "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-600/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-blue-600 hover:bg-blue-50",
    },
    purple: {
      border: "border-purple-100/90",
      bg: "bg-gradient-to-r from-purple-50/50 via-white/80 to-indigo-50/40",
      iconBg: "bg-purple-600 text-white shadow-purple-600/20",
      pillBorder: "border-purple-200",
      totalBg: "bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-lg shadow-purple-600/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-purple-600 hover:bg-purple-50",
    },
    indigo: {
      border: "border-indigo-100/90",
      bg: "bg-gradient-to-r from-indigo-50/50 via-white/80 to-blue-50/40",
      iconBg: "bg-indigo-600 text-white shadow-indigo-600/20",
      pillBorder: "border-indigo-200",
      totalBg: "bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg shadow-indigo-600/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-indigo-600 hover:bg-indigo-50",
    },
    emerald: {
      border: "border-emerald-100/90",
      bg: "bg-gradient-to-r from-emerald-50/50 via-white/80 to-teal-50/40",
      iconBg: "bg-emerald-600 text-white shadow-emerald-600/20",
      pillBorder: "border-emerald-200",
      totalBg: "bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-emerald-600 hover:bg-emerald-50",
    },
    amber: {
      border: "border-amber-100/90",
      bg: "bg-gradient-to-r from-amber-50/50 via-white/80 to-yellow-50/40",
      iconBg: "bg-amber-600 text-white shadow-amber-600/20",
      pillBorder: "border-amber-200",
      totalBg: "bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-amber-600 hover:bg-amber-50",
    },
    yellow: {
      border: "border-yellow-100/90",
      bg: "bg-gradient-to-r from-yellow-50/50 via-white/80 to-amber-50/40",
      iconBg: "bg-amber-500 text-white shadow-amber-500/20",
      pillBorder: "border-yellow-200",
      totalBg: "bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-amber-600 hover:bg-amber-50",
    },
    cyan: {
      border: "border-cyan-100/90",
      bg: "bg-gradient-to-r from-cyan-50/50 via-white/80 to-blue-50/40",
      iconBg: "bg-cyan-600 text-white shadow-cyan-600/20",
      pillBorder: "border-cyan-200",
      totalBg: "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25",
      totalBadgeBg: "bg-white/20 text-white",
      toggleActive: "text-cyan-600 hover:bg-cyan-50",
    },
  }[themeColor];

  const totalClasses = {
    blue: {
      totalBg: "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-600/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    purple: {
      totalBg: "bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-lg shadow-purple-600/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    indigo: {
      totalBg: "bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg shadow-indigo-600/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    emerald: {
      totalBg: "bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    green: {
      totalBg: "bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-600/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    amber: {
      totalBg: "bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    yellow: {
      totalBg: "bg-gradient-to-br from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
    cyan: {
      totalBg: "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25",
      totalBadgeBg: "bg-white/20 text-white",
    },
  }[totalColor || themeColor];

  if (items.length === 0) {
    return null;
  }

  const hasDisabled = disabledKeys.size > 0;

  return (
    <>
      <div
        className={`glass-panel rounded-[26px] border ${themeClasses.border} ${themeClasses.bg} shadow-glass transition-all duration-300 overflow-hidden select-none`}
      >
        {/* Header bar / Expand toggle */}
        <div
          onClick={() => setIsExpanded((prev) => !prev)}
          className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-white/40 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-9 w-9 rounded-2xl ${themeClasses.iconBg} flex items-center justify-center shadow-md shrink-0`}
            >
              <Calculator className="h-4.5 w-4.5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-heading font-black text-slate-800 uppercase tracking-tight">
                  {title || defaultTitle}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-white border border-slate-200/80 text-slate-600 uppercase tracking-wider shadow-2xs">
                  {items.length}{" "}
                  {t("active statuses", "aktívnych stavov", "aktív állapot")}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate max-w-md hidden sm:block">
                {subtitle || defaultSubtitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Collapsed mini-teaser sum */}
            {!isExpanded && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  {t("Total:", "Spolu:", "Összesen:")}
                </span>
                <span className="text-xs font-black text-slate-800 tabular-nums">
                  {formatMoney(totalValue, resolvedCurrency, language, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-[9px] font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                  {totalCount}
                </span>
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
                className={`h-3.5 w-3.5 stroke-[2.5] transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Expanded Equation Section */}
        {isExpanded && (
          <div className="px-5 pb-5 pt-1 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 border-t border-slate-100/80">
            {/* Quick Controls Bar if some are disabled */}
            <div className="flex items-center justify-between gap-2 pt-1 text-[10px] font-bold text-slate-500">
              <span className="text-[10px] font-semibold text-slate-400">
                ({t("click Eye icon or badge to include/exclude; click (i) to inspect calculated items", "kliknutím na Oko/odznak zahrniete/vylúčite; kliknutím na (i) zobrazíte položky", "Kattintson a Szemre/jelvényre a ki/bekapcsoláshoz; kattintson az (i)-re a tételekhez")})
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {hasDisabled && (
                  <button
                    type="button"
                    onClick={enableAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 hover:text-indigo-700 text-[10px] font-black uppercase tracking-wider transition-colors shadow-2xs cursor-pointer"
                    title={t("Enable all statuses", "Zapnúť všetky stavy", "Összes bekapcsolása")}
                  >
                    <RotateCcw className="h-3 w-3 stroke-[2.5]" />
                    <span>{t("Enable All", "Zapnúť všetky", "Mind bekapcsolása")}</span>
                  </button>
                )}
                {!hasDisabled && items.length > 1 && (
                  <button
                    type="button"
                    onClick={disableAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-[10px] font-black uppercase tracking-wider transition-colors shadow-2xs cursor-pointer"
                    title={t("Disable all statuses", "Vypnúť všetky stavy", "Összes kikapcsolása")}
                  >
                    <XCircle className="h-3 w-3 stroke-[2]" />
                    <span>{t("Mute All", "Stlmiť všetky", "Mind elnémítása")}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Equation Formula: <status1> + <status2> + ... = total */}
            <div className="p-3.5 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-sm flex flex-wrap items-center gap-2 sm:gap-2.5">
              {items.map((item, index) => {
                const isDisabled = disabledKeys.has(item.key);
                const isEnabled = !isDisabled;
                const customColor = item.color || "#3b82f6";
                const textColor = isEnabled ? readableOn(customColor) : undefined;
                const isLightFg = textColor === "#ffffff";

                return (
                  <React.Fragment key={item.key}>
                    {index > 0 && (
                      <div className="flex items-center justify-center h-8 w-5 text-slate-300 font-black text-sm select-none shrink-0">
                        +
                      </div>
                    )}

                    <div
                      onClick={() => toggleStatus(item.key)}
                      title={
                        isDisabled
                          ? t(
                              `Click to include ${item.name} in total`,
                              `Kliknutím zahrniete ${item.name} do súčtu`,
                              `Kattintson a(z) ${item.name} hozzáadásához a végösszeghez`
                            )
                          : t(
                              `Click to exclude ${item.name} from total`,
                              `Kliknutím vylúčite ${item.name} zo súčtu`,
                              `Kattintson a(z) ${item.name} kizárásához a végösszegből`
                            )
                      }
                      className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-98 ${
                        isDisabled
                          ? "bg-slate-100/90 border border-slate-200 text-slate-400 opacity-50 hover:opacity-75 shadow-2xs line-through"
                          : "shadow-sm hover:shadow-md hover:brightness-105 border border-transparent"
                      }`}
                      style={
                        isEnabled
                          ? {
                              backgroundColor: customColor,
                              color: textColor,
                              borderColor: customColor,
                              boxShadow: `0 4px 12px -2px ${customColor}45`,
                            }
                          : undefined
                      }
                    >
                      {/* 1. Show/Hide Eye Icon */}
                      <span
                        className="flex items-center justify-center p-0.5 rounded-md hover:bg-black/15 transition-colors shrink-0"
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
                      <span
                        className="text-[10px] font-black uppercase tracking-wider truncate"
                        style={
                          isEnabled
                            ? {
                                color: isLightFg
                                  ? "rgba(255, 255, 255, 0.95)"
                                  : "rgba(11, 18, 32, 0.9)",
                              }
                            : undefined
                        }
                      >
                        {item.name}
                      </span>

                      {/* Monetary Value (Invoicable) */}
                      <span
                        className="font-mono font-black tabular-nums text-xs ml-0.5"
                        style={isEnabled ? { color: textColor } : undefined}
                      >
                        {formatMoney(item.value || 0, resolvedCurrency, language, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>

                      {/* Count Badge */}
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold tabular-nums leading-none transition-colors ${
                          isDisabled
                            ? "bg-slate-200 text-slate-400"
                            : isLightFg
                              ? "bg-white/25 text-white"
                              : "bg-black/15 text-slate-950"
                        }`}
                        style={isEnabled ? { color: textColor } : undefined}
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
                            itemName: item.name,
                            itemColor: customColor,
                            itemValue: item.value,
                            itemCount: item.count,
                            totalBudget: item.totalBudget,
                            invoiced: item.invoiced,
                            rows: item.rows || [],
                          });
                        }}
                        className="ml-0.5 flex items-center justify-center h-5 w-5 rounded-full hover:bg-black/25 active:scale-90 transition-all cursor-pointer shrink-0"
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

              {/* Equals Sign */}
              <div className="flex items-center justify-center h-8 w-6 text-slate-700 font-black text-base select-none shrink-0 px-0.5">
                =
              </div>

              {/* Total Pill */}
              <div
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl ${totalClasses.totalBg} transition-all duration-200 shrink-0`}
              >
                <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest leading-none text-white/80">
                    {t("Total Invoicable", "Spolu na fakturáciu", "Összes számlázható")}
                  </span>
                  <span className="font-mono font-black text-sm sm:text-base tabular-nums leading-tight tracking-tight mt-0.5">
                    {formatMoney(totalValue, resolvedCurrency, language, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div
                  className={`px-2 py-0.5 rounded-lg ${totalClasses.totalBadgeBg} text-[10px] font-black uppercase tracking-wider leading-none ml-1`}
                >
                  {totalCount} {resolvedUnitLabel}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Slideout Drawer for Inspected Items */}
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
