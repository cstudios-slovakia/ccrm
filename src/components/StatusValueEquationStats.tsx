import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  Calculator,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { formatMoney } from "../utils/currency";
import { readableOn } from "../utils/accentColor";
import type { Language } from "../utils/translations";

export interface StatusStatItem {
  key: string;
  name: string;
  value: number;
  count: number;
  color?: string;
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
    "Click any status pill to toggle its inclusion in the equation total",
    "Kliknutím na stav ho zahrniete alebo vylúčite zo súčtu",
    "Kattintson az állapotra a teljes összegből való kizáráshoz/hozzáadáshoz"
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
            <span className="text-[10px] font-semibold text-slate-400 sm:hidden">
              {subtitle || defaultSubtitle}
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
              const customColor = item.color || "#3b82f6";
              const textColor = !isDisabled ? readableOn(customColor) : undefined;
              const isLightFg = textColor === "#ffffff";

              return (
                <React.Fragment key={item.key}>
                  {index > 0 && (
                    <div className="flex items-center justify-center h-8 w-5 text-slate-300 font-black text-sm select-none shrink-0">
                      +
                    </div>
                  )}

                  <button
                    type="button"
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
                    className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-95 ${
                      isDisabled
                        ? "bg-slate-100/90 border border-dashed border-slate-300 text-slate-400 opacity-50 hover:opacity-75 shadow-2xs"
                        : "shadow-sm hover:shadow-md hover:brightness-105 border border-transparent"
                    }`}
                    style={
                      !isDisabled
                        ? {
                            backgroundColor: customColor,
                            color: textColor,
                            boxShadow: `0 4px 12px -2px ${customColor}45`,
                          }
                        : undefined
                    }
                  >
                    {/* Status Name */}
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider ${
                        isDisabled ? "line-through text-slate-400" : ""
                      }`}
                      style={
                        !isDisabled
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

                    {/* Monetary Value */}
                    <span
                      className={`font-mono font-black tabular-nums text-xs ml-0.5 ${
                        isDisabled ? "line-through text-slate-400" : ""
                      }`}
                      style={!isDisabled ? { color: textColor } : undefined}
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
                      style={!isDisabled ? { color: textColor } : undefined}
                    >
                      {item.count}
                    </span>

                    {/* Muted Indicator Icon */}
                    {isDisabled && (
                      <span className="text-[8px] font-bold text-rose-500 uppercase tracking-tighter ml-0.5">
                        ✕
                      </span>
                    )}
                  </button>
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
                  {t("Total", "Spolu", "Összesen")}
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
  );
};
