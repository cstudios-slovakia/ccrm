import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Calculator,
  RotateCcw,
  XCircle,
  Layers,
  Briefcase,
  Receipt,
  Plus,
  Equal,
  Hash,
  Info,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import { formatMoney } from "../utils/currency";
import { deepenForWhite } from "../utils/accentColor";
import { cn } from "../utils/cn";
import type { Language } from "../utils/translations";
import { BigNumber, CardFooter, SegmentBar, SegmentedToggle, WidgetCard } from "./dashboard/widgetKit";

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
  /** Closed in the lead / project status settings (won, lost, completed, cancelled…). */
  closed?: boolean;
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

export type GroupedEquationView = "detail" | "summary";

export interface GroupedStatusValueEquationStatsProps {
  groups: StatusStatGroup[];
  currency?: string | null;
  language: Language;
  title?: string;
  subtitle?: string;
  storageKey?: string;
  defaultExpanded?: boolean;
  /**
   * Draw inside a dashboard widget card (the shared title row, radius and
   * hairline) instead of as a panel of its own, and lay the groups out by the
   * card's width rather than the window's — a widget can be a quarter of the
   * board wide.
   */
  embedded?: {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    /** "detail" draws the status pills, "summary" the total and a line per group. */
    view?: GroupedEquationView;
    /** The card's own toggle; without it the view is kept in the component. */
    onView?: (view: GroupedEquationView) => void;
    /** The "Remaining invoicable" line on a group. Shown unless false. */
    showRemaining?: boolean;
    /** How many records each status and group holds. Shown unless false. */
    showCounts?: boolean;
  };

  /** Controlled view. With `onViewChange` the caller owns it; otherwise it is kept here. */
  view?: GroupedEquationView;
  onViewChange?: (view: GroupedEquationView) => void;
  /** Controlled "how many records" switch. The toggle is only drawn when `onShowCountsChange` is given or when not embedded. */
  showCounts?: boolean;
  onShowCountsChange?: (show: boolean) => void;
  /** Controlled list of status keys left out of the total (${groupId}:${itemKey}). */
  excludedKeys?: string[];
  onExcludedKeysChange?: (keys: string[]) => void;
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

const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
};

export const GroupedStatusValueEquationStats: React.FC<GroupedStatusValueEquationStatsProps> = ({
  groups,
  currency,
  language = "sk",
  title,
  subtitle,
  storageKey,
  defaultExpanded = true,
  embedded,
  view: controlledView,
  onViewChange,
  showCounts: controlledShowCounts,
  onShowCountsChange,
  excludedKeys,
  onExcludedKeysChange,
}) => {
  const resolvedCurrency = currency || "EUR";

  // Uncontrolled fallbacks. They only matter when the caller does not own the
  // value, and they only touch localStorage when a storageKey was given.
  const [localExpanded, setLocalExpanded] = useState<boolean>(() => {
    if (storageKey) {
      const saved = readStored(`${storageKey}_expanded`);
      if (saved !== null) return saved === "true";
    }
    return defaultExpanded;
  });

  const [localDisabled, setLocalDisabled] = useState<Set<string>>(() => {
    if (storageKey) {
      try {
        const saved = readStored(`${storageKey}_disabled`);
        const parsed = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed)) return new Set(parsed);
      } catch {
        // ignore storage errors
      }
    }
    return new Set();
  });

  const [localShowCounts, setLocalShowCounts] = useState(true);

  const view: GroupedEquationView =
    controlledView ?? embedded?.view ?? (localExpanded ? "detail" : "summary");
  const showCounts =
    controlledShowCounts ?? (embedded?.showCounts !== undefined ? embedded.showCounts : localShowCounts);
  const disabledKeys = useMemo(
    () => (excludedKeys ? new Set(excludedKeys) : localDisabled),
    [excludedKeys, localDisabled]
  );

  const setView = (next: GroupedEquationView) => {
    if (onViewChange) onViewChange(next);
    else if (embedded?.onView) embedded.onView(next);
    else setLocalExpanded(next === "detail");
  };

  const setDisabled = (next: Set<string>) => {
    if (onExcludedKeysChange) onExcludedKeysChange(Array.from(next));
    else setLocalDisabled(next);
  };

  const setShowCounts = (next: boolean) => {
    if (onShowCountsChange) onShowCountsChange(next);
    else setLocalShowCounts(next);
  };

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

  // Persist the uncontrolled state
  useEffect(() => {
    if (storageKey && controlledView === undefined && !embedded?.onView) {
      writeStored(`${storageKey}_expanded`, String(localExpanded));
    }
  }, [localExpanded, storageKey, controlledView, embedded]);

  useEffect(() => {
    if (storageKey && !excludedKeys) {
      writeStored(`${storageKey}_disabled`, JSON.stringify(Array.from(localDisabled)));
    }
  }, [localDisabled, storageKey, excludedKeys]);

  const toggleStatus = (groupId: string, itemKey: string) => {
    const fullKey = `${groupId}:${itemKey}`;
    const next = new Set(disabledKeys);
    if (next.has(fullKey)) next.delete(fullKey);
    else next.add(fullKey);
    setDisabled(next);
  };

  const enableAll = () => setDisabled(new Set());

  const disableAll = () => {
    const allKeys = new Set<string>();
    groups.forEach((g) => {
      g.items.forEach((item) => {
        allKeys.add(`${g.id}:${item.key}`);
      });
    });
    setDisabled(allKeys);
  };

  const t = (en: string, sk: string, hu: string) => {
    if (language === "hu") return hu;
    if (language === "sk") return sk;
    return en;
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

  const grandTotalValue = useMemo(() => {
    return calculatedGroups.reduce((sum, g) => sum + g.subtotalValue, 0);
  }, [calculatedGroups]);

  const grandTotalCount = useMemo(() => {
    return calculatedGroups.reduce((sum, g) => sum + g.subtotalCount, 0);
  }, [calculatedGroups]);

  const totalPossibleItemsCount = useMemo(() => {
    return groups.reduce((sum, g) => sum + g.items.length, 0);
  }, [groups]);

  const enabledStatusesCount = useMemo(() => {
    return calculatedGroups.reduce((sum, g) => sum + g.enabledItems.length, 0);
  }, [calculatedGroups]);

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
  if (!hasAnyItems && !embedded) return null;

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

  const money = (value: number) =>
    formatMoney(value, resolvedCurrency, language, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const showRemaining = embedded?.showRemaining !== false;

  const ghostButton =
    "flex items-center gap-1 h-7 px-2 rounded-lg text-ui font-bold whitespace-nowrap transition-colors cursor-pointer";

  const openDrawer = (group: (typeof calculatedGroups)[number], item: StatusStatItem) => {
    setDrawerSearch("");
    setDrawerData({
      groupName: group.name,
      groupColor: group.colorTheme || "blue",
      itemName: item.name,
      itemColor: item.color || "#3b82f6",
      itemValue: item.value,
      itemCount: item.count,
      totalBudget: item.totalBudget,
      invoiced: item.invoiced,
      rows: item.rows || [],
    });
  };

  const groupChip = (group: (typeof calculatedGroups)[number]) => {
    const Icon = group.icon || (group.id === "leads" ? Layers : Briefcase);
    return (
      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </span>
    );
  };

  const remainingRow = (group: (typeof calculatedGroups)[number]) =>
    showRemaining && group.extraHighlight ? (
      <div className="flex items-center justify-between gap-3 h-11 border-t border-slate-100">
        <span className="flex items-center gap-2.5 min-w-0">
          <Receipt className="h-4 w-4 text-amber-600 shrink-0" strokeWidth={2.25} />
          <span className="flex flex-col min-w-0">
            <span className="text-ui font-semibold text-slate-700 truncate">{group.extraHighlight.label}</span>
            {group.extraHighlight.subtext && (
              <span className="text-caption font-semibold text-slate-400 truncate">
                {group.extraHighlight.subtext}
              </span>
            )}
          </span>
        </span>
        <span className="text-title-sm font-bold text-slate-900 tabular-nums shrink-0">
          {money(group.extraHighlight.value)}
        </span>
      </div>
    ) : null;

  const statusPill = (group: (typeof calculatedGroups)[number], item: StatusStatItem) => {
    const fullKey = `${group.id}:${item.key}`;
    const on = !disabledKeys.has(fullKey);
    const fill = deepenForWhite(item.color || "#3b82f6");
    const toggle = () => toggleStatus(group.id, item.key);
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={on}
        data-status-key={fullKey}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        title={`${item.name}: ${money(item.value)} (${item.count}) — ${
          on
            ? t("Click to leave out", "Kliknutím vylúčite", "Kattintson a kizáráshoz")
            : t("Click to count", "Kliknutím zahrniete", "Kattintson a beszámításhoz")
        }`}
        className={cn(
          "inline-flex items-center gap-2 h-8 pl-2.5 pr-1 rounded-lg border whitespace-nowrap transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
          on
            ? "text-white hover:brightness-110"
            : "bg-white border-dashed border-slate-300 text-slate-500 hover:text-slate-700"
        )}
        style={on ? { backgroundColor: fill, borderColor: fill } : undefined}
      >
        <span className={cn("type-overline", !on && "line-through")}>{item.name}</span>
        <span className={cn("text-ui font-bold tabular-nums", !on && "line-through")}>{money(item.value)}</span>
        {showCounts && (
          <span
            className={cn(
              "text-caption font-bold px-1.5 rounded-md",
              on ? "bg-black/20" : "bg-slate-100 text-slate-500"
            )}
          >
            {item.count}
          </span>
        )}
        <button
          type="button"
          aria-label={t(
            "Inspect calculated leads / projects",
            "Zobraziť zoznam kalkulovaných obchodov/projektov",
            "Kalkulált tételek részletes megtekintése"
          )}
          onClick={(e) => {
            e.stopPropagation();
            openDrawer(group, item);
          }}
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded-md transition-colors cursor-pointer",
            on ? "hover:bg-black/20" : "hover:bg-slate-100"
          )}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    );
  };

  const widgetActions = (
    <>
      {hasDisabledAnywhere && (
        <button
          type="button"
          onClick={enableAll}
          className={cn(ghostButton, "text-indigo-600 hover:bg-indigo-50")}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
          {t("Select all", "Vybrať všetko", "Összes kijelölése")}
        </button>
      )}
      {(onShowCountsChange || !embedded) && (
        <button
          type="button"
          aria-pressed={showCounts}
          onClick={() => setShowCounts(!showCounts)}
          title={
            showCounts
              ? t("Hide record counts", "Skryť počty záznamov", "Darabszámok elrejtése")
              : t("Show record counts", "Zobraziť počty záznamov", "Darabszámok megjelenítése")
          }
          className={cn(
            ghostButton,
            showCounts
              ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          )}
        >
          <Hash className="h-3.5 w-3.5" strokeWidth={2.25} />
          {t("Counts", "Počty", "Darabszám")}
        </button>
      )}
      <SegmentedToggle
        value={view}
        onChange={(next) => setView(next as GroupedEquationView)}
        options={[
          { value: "detail", label: t("Detail", "Detail", "Részletes") },
          { value: "summary", label: t("Summary", "Prehľad", "Összegzés") },
        ]}
      />
    </>
  );

  const widgetBody = (
    <>
      <div className="flex flex-col gap-3" title={subtitle || defaultSubtitle}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <BigNumber>{money(grandTotalValue)}</BigNumber>
          <span className="text-ui font-semibold text-slate-500">
            {t("invoicable in total", "na fakturovanie spolu", "számlázható összesen")}
            {showCounts && ` · ${grandTotalCount} ${t("items", "položiek", "tétel")}`}
            {hasDisabledAnywhere &&
              ` · ${enabledStatusesCount} ${t("of", "zo", "/")} ${totalPossibleItemsCount} ${t("statuses", "stavov", "állapot")}`}
          </span>
        </div>
        <SegmentBar
          thickness={12}
          segments={calculatedGroups.flatMap((group) =>
            group.enabledItems.map((item) => ({
              key: `${group.id}:${item.key}`,
              value: Number(item.value) || 0,
              color: item.color || "#3b82f6",
              label: `${group.name} · ${item.name}: ${money(item.value)}`,
            }))
          )}
        />
      </div>

      {view === "summary" ? (
        <div className="flex flex-col">
          {calculatedGroups.map((group) => (
            <React.Fragment key={group.id}>
              <div className="flex items-center justify-between gap-3 h-11 border-t border-slate-100">
                <span className="flex items-center gap-2.5 min-w-0">
                  {groupChip(group)}
                  <span className="text-ui font-bold text-slate-800 truncate">{group.name}</span>
                </span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="text-title-sm font-bold text-slate-900 tabular-nums">
                    {money(group.subtotalValue)}
                  </span>
                  {showCounts && (
                    <span className="text-ui font-semibold text-slate-400 tabular-nums">
                      {group.subtotalCount} {group.unitLabel || t("items", "pol.", "db")}
                    </span>
                  )}
                </span>
              </div>
              {remainingRow(group)}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 @3xl/eq:grid-cols-2">
            {calculatedGroups.map((group) => (
              <section key={group.id} className="flex flex-col gap-3 min-w-0 border-t border-slate-100 pt-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 min-w-0">
                    {groupChip(group)}
                    <span className="flex flex-col min-w-0">
                      <span className="text-ui font-bold text-slate-800 truncate">{group.name}</span>
                      <span className="text-caption font-semibold text-slate-500 truncate">
                        {group.enabledItems.length} {t("of", "zo", "/")} {group.items.length}{" "}
                        {group.unitLabel || t("statuses", "stavov", "állapot")}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span className="text-title-sm font-bold text-slate-900 tabular-nums">
                      {money(group.subtotalValue)}
                    </span>
                    {showCounts && (
                      <span className="text-ui font-semibold text-slate-400 tabular-nums">
                        {group.subtotalCount} {group.unitLabel || t("items", "pol.", "db")}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                  {group.items.map((item, index) => (
                    <React.Fragment key={item.key}>
                      {index > 0 && <span className="text-ui font-bold text-slate-300">+</span>}
                      {statusPill(group, item)}
                    </React.Fragment>
                  ))}
                </div>

                {remainingRow(group)}
              </section>
            ))}
          </div>

          <CardFooter>
            <span className="flex items-center gap-1.5 flex-wrap text-ui font-semibold text-slate-500 min-w-0">
              {calculatedGroups.map((group, index) => (
                <React.Fragment key={group.id}>
                  {index > 0 && <Plus className="h-3 w-3 text-slate-400 shrink-0" strokeWidth={3} />}
                  <span className="whitespace-nowrap">
                    {group.name}{" "}
                    <span className="font-bold text-slate-700 tabular-nums">{money(group.subtotalValue)}</span>
                  </span>
                </React.Fragment>
              ))}
              <Equal className="h-3 w-3 text-slate-400 shrink-0" strokeWidth={3} />
              <span className="font-bold text-slate-700 tabular-nums whitespace-nowrap">
                {money(grandTotalValue)}
              </span>
            </span>
            <button
              type="button"
              onClick={disableAll}
              className={cn(ghostButton, "text-slate-500 hover:text-slate-700 hover:bg-slate-100 shrink-0")}
            >
              <XCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t("Clear all", "Zrušiť všetko", "Minden törlése")}
            </button>
          </CardFooter>
        </>
      )}
    </>
  );

  return (
    <>
      <div data-status-equation className={embedded ? "h-full" : undefined}>
        <WidgetCard
          icon={embedded?.icon || Calculator}
          accent={embedded?.accent || "#4f46e5"}
          title={embedded?.title || title || defaultTitle}
          titleTooltip={subtitle || defaultSubtitle}
          actions={hasAnyItems ? widgetActions : undefined}
          className={cn("@container/eq select-none", embedded && "h-full")}
        >
          {hasAnyItems ? (
            widgetBody
          ) : (
            <div className="flex-1 flex items-center justify-center py-6 text-ui text-slate-400 font-semibold text-center">
              {t(
                "No statuses to sum — check which ones this widget counts in its settings.",
                "Žiadne stavy na sčítanie — v nastaveniach modulu skontrolujte, ktoré sa započítavajú.",
                "Nincs összegezhető állapot — a modul beállításaiban ellenőrizze, melyek számítanak."
              )}
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Slideout Drawer for Inspected Items */}
      {drawerData &&
        createPortal(
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[9999] flex justify-end animate-fade-in"
            onClick={() => setDrawerData(null)}
          >
            <div
              className="w-full max-w-lg ws-sm:max-w-xl bg-white h-full shadow-2xl flex flex-col z-[10000] animate-in slide-in-from-right duration-300 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="h-10 w-10 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 font-heading font-bold text-body"
                    style={{ backgroundColor: deepenForWhite(drawerData.itemColor) }}
                  >
                    {drawerData.itemCount}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="type-overline text-slate-400">
                        {drawerData.groupName}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full type-overline text-white shadow-2xs"
                        style={{ backgroundColor: deepenForWhite(drawerData.itemColor) }}
                      >
                        {drawerData.itemName}
                      </span>
                    </div>
                    <h3 className="text-title-sm font-heading font-bold text-slate-900 truncate mt-0.5">
                      {t("Calculated Items Breakdown", "Prehľad kalkulovaných položiek", "Kalkulált tételek részletei")}
                    </h3>
                    <p className="text-ui font-semibold text-slate-500 mt-0.5">
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
                <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between gap-3 text-ui shrink-0">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <span className="type-overline text-slate-400 block">
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
                        <span className="type-overline text-slate-400 block">
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
                      <span className="type-overline text-amber-700 block">
                        {t("Remaining Invoicable", "Zostáva vyfakturovať", "Hátralévő számlázható")}
                      </span>
                      <span className="font-heading font-bold text-amber-950 tabular-nums">
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
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-ui font-semibold focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-colors"
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
                    <p className="text-ui font-semibold">
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
                              className={`px-2 py-0.5 rounded-full type-overline ${
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
                              <span className="px-2 py-0.5 rounded-full text-micro font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {row.division}
                              </span>
                            )}
                            {row.date && (
                              <span className="text-micro font-semibold text-slate-400">
                                {row.date}
                              </span>
                            )}
                          </div>

                          <a
                            href={row.url || "#"}
                            onClick={() => setDrawerData(null)}
                            className="text-body font-heading font-bold text-slate-900 hover:text-indigo-600 transition-colors line-clamp-1 block"
                          >
                            {row.name}
                          </a>

                          {row.clientName && (
                            <p className="text-ui font-semibold text-slate-500 truncate mt-0.5">
                              {row.clientName}
                            </p>
                          )}
                        </div>

                        {/* Invoicable Value Badge */}
                        <div className="text-right shrink-0">
                          <span className="type-overline text-slate-400 block">
                            {t("Invoicable", "Na fakturovanie", "Számlázható")}
                          </span>
                          <span className="text-body font-heading font-bold text-emerald-600 tabular-nums">
                            {formatMoney(row.invoicable, resolvedCurrency, language, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Financial Details for Projects with Invoiced vs Budget */}
                      {row.type === "project" && row.totalBudget !== undefined && row.totalBudget > 0 && (
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-micro text-slate-500">
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
                            <span className="text-slate-400 truncate max-w-30">
                              PM: {row.manager}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <a
                          href={row.url || "#"}
                          onClick={() => setDrawerData(null)}
                          className="text-micro font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
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
              <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-ui text-slate-500 shrink-0">
                <span className="font-semibold text-caption">
                  {filteredDrawerRows.length} {t("items calculated", "kalkulovaných položiek", "tétel számolva")}
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerData(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-ui hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t("Close", "Zavrieť", "Bezárás")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
