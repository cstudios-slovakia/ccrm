import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  ChevronsDownUp,
  ChevronsUpDown,
  FileWarning,
  RefreshCw,
  Ticket as TicketIcon,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import type { Language } from "../../utils/translations";
import { formatMoney } from "../../utils/currency";
import { recordHref } from "../../utils/clientRecord";
import { projectStatusBadgeStyle, projectStatusLabel } from "../../utils/projects";
import { useStickyTableHead } from "../../hooks/useStickyTableHead";
import { StickyHScrollbar } from "../ui/StickyHScrollbar";
import { CustomSelect } from "../ui/CustomSelect";
import {
  BREAKDOWN_COLUMNS,
  formatHoursShort,
  formatWaitDuration,
  type BreakdownClientRow,
  type BreakdownColumnConfig,
  type BreakdownColumnKey,
  type BreakdownEmployeeRow,
  type BreakdownHealthFilter,
  type BreakdownPeriodPreset,
  type BreakdownPortfolioSummary,
  type BreakdownPresetId,
  type BreakdownProjectRow,
  type BreakdownRights,
  type MoneyMap,
} from "../../utils/projectBreakdown";

interface ProjectBreakdownViewProps {
  t: (en: string, sk: string, hu: string) => string;
  userLanguage: Language;
  defaultCurrency: string;
  clients: BreakdownClientRow[];
  summary: BreakdownPortfolioSummary;
  columns: BreakdownColumnConfig[];
  rights: BreakdownRights;
  loadingTime: boolean;
  healthFilter: BreakdownHealthFilter;
  onHealthFilterChange: (next: BreakdownHealthFilter) => void;
  periodPreset: BreakdownPeriodPreset;
  onPeriodPresetChange: (next: BreakdownPeriodPreset) => void;
  onApplyPreset: (preset: BreakdownPresetId) => void;
  onSelectProject: (projectId: string) => void;
  onQuickEditProject?: (projectId: string) => void;
}

const formatMoneyMap = (
  map: MoneyMap | null | undefined,
  lang: Language,
  fallbackCurrency: string,
  showZero = false,
): React.ReactNode => {
  if (!map) return <span className="text-gray-400">—</span>;
  const entries = Object.entries(map).filter(([, amt]) => Math.abs(amt) > 0.004);
  if (entries.length === 0) {
    return showZero ? (
      <span className="tabular-nums text-gray-500">{formatMoney(0, fallbackCurrency, lang)}</span>
    ) : (
      <span className="text-gray-400">—</span>
    );
  }
  return (
    <div className="flex flex-col items-end gap-0.5 tabular-nums">
      {entries.map(([curr, amt]) => (
        <span key={curr}>{formatMoney(amt, curr, lang)}</span>
      ))}
    </div>
  );
};

const colMetaMap = new Map(BREAKDOWN_COLUMNS.map((c) => [c.key, c]));

export const ProjectBreakdownView: React.FC<ProjectBreakdownViewProps> = ({
  t,
  userLanguage,
  defaultCurrency,
  clients,
  summary,
  columns,
  rights,
  loadingTime,
  healthFilter,
  onHealthFilterChange,
  periodPreset,
  onPeriodPresetChange,
  onApplyPreset,
  onSelectProject,
  onQuickEditProject,
}) => {
  const [tableWrapRef, tableWrapEl] = useStickyTableHead();
  const [expandedClients, setExpandedClients] = useState<Set<string>>(() => new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);
  const columnLabel = (key: BreakdownColumnKey): string => {
    const def = colMetaMap.get(key);
    if (!def) return key;
    return t(def.labels[0], def.labels[1], def.labels[2]);
  };

  const toggleClient = (key: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const expandClientsOnly = () => {
    setExpandedClients(new Set(clients.map((c) => c.key)));
    setExpandedProjects(new Set());
  };

  const expandAllLevels = () => {
    setExpandedClients(new Set(clients.map((c) => c.key)));
    const pIds = new Set<string>();
    for (const c of clients) {
      for (const p of c.projects) pIds.add(p.project.id);
    }
    setExpandedProjects(pIds);
  };

  const collapseAll = () => {
    setExpandedClients(new Set());
    setExpandedProjects(new Set());
  };

  const salaryCadenceLabel = (type: BreakdownEmployeeRow["contractSalaryType"]) => {
    if (type === "hourly") return t("/h", "/h", "/ó");
    if (type === "daily") return t("/d", "/d", "/n");
    return t("/mo", "/mes.", "/hó");
  };

  const healthPills: { id: BreakdownHealthFilter; label: string; tone?: string }[] = [
    { id: "all", label: t("All", "Všetky", "Mind") },
    { id: "at_risk", label: t("At Risk / Low Margin", "Riziko / Nízka marža", "Kockázat / Alacsony árrés"), tone: "rose" },
    { id: "unbilled", label: t("Unbilled Work", "Nefakturované", "Számlázatlan") },
    { id: "overdue", label: t("Overdue / Slipped", "Po termíne / Posuny", "Késés / Csúszás"), tone: "amber" },
    { id: "bottlenecks", label: t("Queue & Reopens", "Čakanie a znovuotvorenia", "Várakozás és újranyitás"), tone: "purple" },
  ];

  const renderClientCell = (colKey: BreakdownColumnKey, c: BreakdownClientRow) => {
    switch (colKey) {
      case "entity": {
        const isOpen = expandedClients.has(c.key);
        return (
          <div className="flex items-center gap-2.5 min-w-56">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleClient(c.key);
              }}
              aria-expanded={isOpen}
              aria-label={isOpen ? t("Collapse client", "Zbaliť klienta", "Ügyfél összecsukása") : t("Expand client", "Rozbaliť klienta", "Ügyfél kibontása")}
              className="p-1 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-200/70 transition cursor-pointer shrink-0"
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {c.record ? (
                  <a
                    href={recordHref(c.record)}
                    onClick={(e) => e.stopPropagation()}
                    className="font-heading font-bold text-body text-gray-900 hover:text-entity-text transition truncate"
                  >
                    {c.name}
                  </a>
                ) : (
                  <span className="font-heading font-bold text-body text-gray-700 truncate">
                    {c.name}
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded-full text-micro font-bold bg-gray-100 text-gray-600 border border-gray-200 tabular-nums">
                  {c.projectCount}
                </span>
                {c.overdueProjectsCount > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200 tabular-nums"
                    title={t("Overdue projects", "Projekty po termíne", "Lejárt határidejű projektek")}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {c.overdueProjectsCount}
                  </span>
                )}
                {c.unexplainedDelayCount > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200 tabular-nums"
                    title={t("Missing delay reason", "Chýba dôvod omeškania", "Hiányzó késési indok")}
                  >
                    <FileWarning className="h-3 w-3" />
                    {c.unexplainedDelayCount}
                  </span>
                )}
              </div>
              <div className="text-micro text-gray-500 mt-0.5 flex items-center gap-2 tabular-nums">
                <span>
                  {c.tasks.open} {t("open tasks", "otv. úloh", "nyitott feladat")}
                </span>
                {c.tickets.open > 0 && (
                  <span>
                    · {c.tickets.open} {t("open tickets", "otv. tiketov", "nyitott jegy")}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      }
      case "value":
        return <span className="font-mono font-bold text-gray-900">{formatMoneyMap(c.valueByCurrency, userLanguage, defaultCurrency)}</span>;
      case "invoicable":
        return <span className="font-mono font-semibold text-amber-700">{formatMoneyMap(c.invoicableByCurrency, userLanguage, defaultCurrency, true)}</span>;
      case "stillToBePaid":
        return <span className="font-mono font-bold text-emerald-700">{formatMoneyMap(c.stillToBePaidByCurrency, userLanguage, defaultCurrency, true)}</span>;
      case "timeWorked":
        return (
          <div className="text-right tabular-nums">
            <span className="font-mono font-bold text-gray-900 block">{formatHoursShort(c.seconds)}</span>
            {c.seconds > 0 && c.billableSeconds < c.seconds && (
              <span className="text-micro text-gray-400 block">
                {formatHoursShort(c.billableSeconds)} {t("bill.", "fakt.", "száml.")}
              </span>
            )}
          </div>
        );
      case "laborAndSalary":
        return (
          <div className="text-right tabular-nums">
            <span className="font-mono font-semibold text-gray-800 block">
              {c.laborCost !== null ? formatMoney(c.laborCost, defaultCurrency, userLanguage) : "—"}
            </span>
            {Object.keys(c.directExpensesByCurrency).length > 0 && (
              <span className="text-micro text-gray-400 block">
                +{t("exp.", "nákl.", "ktg.")}{" "}
                {Object.entries(c.directExpensesByCurrency)
                  .map(([curr, amt]) => formatMoney(amt, curr, userLanguage))
                  .join(" / ")}
              </span>
            )}
          </div>
        );
      case "margin":
        return (
          <div className="text-right tabular-nums">
            <span
              className={`font-mono font-bold block ${
                c.marginPercent !== null && c.marginPercent < 15
                  ? "text-rose-600"
                  : c.marginPercent !== null && c.marginPercent >= 35
                  ? "text-emerald-700"
                  : "text-gray-900"
              }`}
            >
              {formatMoneyMap(c.marginByCurrency, userLanguage, defaultCurrency)}
            </span>
            {c.marginPercent !== null && (
              <span
                className={`text-micro font-bold block ${
                  c.marginPercent < 15 ? "text-rose-600" : c.marginPercent >= 35 ? "text-emerald-600" : "text-gray-500"
                }`}
              >
                {c.marginPercent.toFixed(1)}%
              </span>
            )}
          </div>
        );
      case "effectiveRate":
        return (
          <div className="text-right font-mono font-semibold text-gray-700 tabular-nums">
            {Object.keys(c.effectiveHourlyRateByCurrency).length > 0
              ? Object.entries(c.effectiveHourlyRateByCurrency).map(([curr, amt]) => (
                  <div key={curr}>
                    {formatMoney(amt, curr, userLanguage)}/{t("h", "h", "ó")}
                  </div>
                ))
              : <span className="text-gray-400">—</span>}
          </div>
        );
      case "tasksCount":
        return (
          <div className="text-center tabular-nums">
            <span className="font-bold text-gray-900">{c.tasks.open}</span>
            <span className="text-gray-400"> / {c.tasks.total}</span>
            {c.tasks.overdue > 0 && (
              <span className="block text-micro font-bold text-rose-600">
                {c.tasks.overdue} {t("late", "mešká", "késik")}
              </span>
            )}
          </div>
        );
      case "tasksReopened":
        return (
          <span className={`font-bold tabular-nums ${c.tasks.reopened > 0 ? "text-amber-700" : "text-gray-400"}`}>
            {c.tasks.reopened > 0 ? c.tasks.reopened : "0"}
          </span>
        );
      case "tasksWait":
        return (
          <div className="text-right tabular-nums">
            <span className="font-semibold text-gray-800 block">
              {formatWaitDuration(c.tasks.wait.avgSeconds, userLanguage)}
            </span>
            {c.tasks.wait.waitingNowCount > 0 && (
              <span className="text-micro font-bold text-amber-700 block">
                {c.tasks.wait.waitingNowCount} {t("waiting", "čaká", "vár")}
              </span>
            )}
          </div>
        );
      case "deadlineHealth":
        return (
          <div className="text-center tabular-nums">
            {c.tasks.deadlineMoves > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {c.tasks.deadlineMoves}× {t("slipped", "posun", "csúszás")}
              </span>
            ) : (
              <span className="text-micro text-gray-400">{t("On track", "V norme", "Rendben")}</span>
            )}
          </div>
        );
      case "ticketsCount":
        return (
          <div className="text-center tabular-nums">
            <span className="font-bold text-gray-900">{c.tickets.open}</span>
            <span className="text-gray-400"> / {c.tickets.total}</span>
            {c.tickets.slaBreached > 0 && (
              <span className="block text-micro font-bold text-rose-600">
                {c.tickets.slaBreached} SLA
              </span>
            )}
          </div>
        );
      case "ticketsReopened":
        return (
          <span className={`font-bold tabular-nums ${c.tickets.reopened > 0 ? "text-amber-700" : "text-gray-400"}`}>
            {c.tickets.reopened > 0 ? c.tickets.reopened : "0"}
          </span>
        );
      case "ticketsWait":
        return (
          <div className="text-right tabular-nums">
            <span className="font-semibold text-gray-800 block">
              {formatWaitDuration(c.tickets.wait.avgSeconds, userLanguage)}
            </span>
            {c.tickets.wait.waitingNowCount > 0 && (
              <span className="text-micro font-bold text-rose-600 block">
                {c.tickets.wait.waitingNowCount} {t("untouched", "neotv.", "érintetlen")}
              </span>
            )}
          </div>
        );
    }
  };

  const renderProjectCell = (colKey: BreakdownColumnKey, p: BreakdownProjectRow) => {
    switch (colKey) {
      case "entity": {
        const isOpen = expandedProjects.has(p.project.id);
        const canExpand = p.employees.length > 0;
        const badgeStyle = projectStatusBadgeStyle(p.project.status);
        return (
          <div className="flex items-center gap-2 pl-6 min-w-56">
            <button
              type="button"
              disabled={!canExpand}
              onClick={(e) => {
                e.stopPropagation();
                if (canExpand) toggleProject(p.project.id);
              }}
              aria-expanded={isOpen}
              aria-label={isOpen ? t("Collapse project", "Zbaliť projekt", "Projekt összecsukása") : t("Expand project", "Rozbaliť projekt", "Projekt kibontása")}
              className={`p-1 rounded-md transition shrink-0 ${
                canExpand
                  ? "text-gray-500 hover:text-gray-900 hover:bg-gray-200/70 cursor-pointer"
                  : "text-gray-300 cursor-default"
              }`}
            >
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <a
                  href={`#projects/${encodeURIComponent(p.project.id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectProject(p.project.id);
                  }}
                  className="font-heading font-semibold text-ui text-gray-900 hover:text-entity-text transition truncate"
                >
                  {p.name}
                </a>
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-bold border shrink-0"
                  style={badgeStyle}
                >
                  {projectStatusLabel(p.project.status, t)}
                </span>
                {onQuickEditProject && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickEditProject(p.project.id);
                    }}
                    title={t("Quick edit", "Rýchla úprava", "Gyors szerkesztés")}
                    className="p-0.5 text-gray-400 hover:text-gray-700 rounded-sm hover:bg-gray-100 transition cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-micro text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                {p.projectType?.name && <span>{p.projectType.name}</span>}
                {p.employees.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-gray-400">
                    <Users className="h-3 w-3" />
                    {p.employees.length}
                  </span>
                )}
                {p.retainerMonthlyHours !== null && (
                  <span
                    className={`font-semibold tabular-nums ${
                      p.retainerOverageMinutes > 0 ? "text-rose-600" : "text-indigo-600"
                    }`}
                  >
                    {t("Retainer", "Paušál", "Átalány")}: {p.retainerUsedHours ?? 0}/{p.retainerMonthlyHours}h
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      }
      case "value":
        return (
          <span className="font-mono font-semibold text-gray-900 tabular-nums">
            {p.hasValue ? formatMoney(p.value, p.currency, userLanguage) : "—"}
          </span>
        );
      case "invoicable":
        return (
          <span className={`font-mono font-semibold tabular-nums ${p.invoicable > 0 ? "text-amber-700" : "text-gray-400"}`}>
            {p.hasValue ? formatMoney(p.invoicable, p.currency, userLanguage) : "—"}
          </span>
        );
      case "stillToBePaid":
        return (
          <span className={`font-mono font-semibold tabular-nums ${p.stillToBePaid > 0 ? "text-emerald-700" : "text-gray-400"}`}>
            {p.hasValue || p.stillToBePaid > 0 ? formatMoney(p.stillToBePaid, p.currency, userLanguage) : "—"}
          </span>
        );
      case "timeWorked": {
        const pctBudget = p.hoursBudget && p.hoursBudget > 0 ? Math.min(100, Math.round(((p.seconds / 3600) / p.hoursBudget) * 100)) : null;
        return (
          <div className="text-right tabular-nums">
            <span className="font-mono font-semibold text-gray-900 block">{formatHoursShort(p.seconds)}</span>
            {p.hoursBudget ? (
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <div className="w-14 h-1 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pctBudget && pctBudget >= 100 ? "bg-rose-500" : "bg-entity-solid"}`}
                    style={{ width: `${pctBudget ?? 0}%` }}
                  />
                </div>
                <span className="text-micro text-gray-500">/{p.hoursBudget}h</span>
              </div>
            ) : null}
          </div>
        );
      }
      case "laborAndSalary":
        return (
          <div className="text-right tabular-nums">
            <span className="font-mono font-semibold text-gray-800 block">
              {p.laborCost !== null ? formatMoney(p.laborCost, p.currency, userLanguage) : "—"}
            </span>
            {p.directExpenses > 0 && (
              <span className="text-micro text-gray-400 block">
                +{t("exp.", "nákl.", "ktg.")} {formatMoney(p.directExpenses, p.currency, userLanguage)}
              </span>
            )}
          </div>
        );
      case "margin":
        return (
          <div className="text-right tabular-nums">
            <span
              className={`font-mono font-semibold block ${
                p.marginAmount !== null && p.marginAmount < 0
                  ? "text-rose-600"
                  : p.marginPercent !== null && p.marginPercent >= 35
                  ? "text-emerald-700"
                  : "text-gray-900"
              }`}
            >
              {p.marginAmount !== null ? formatMoney(p.marginAmount, p.currency, userLanguage) : "—"}
            </span>
            {p.marginPercent !== null && (
              <span
                className={`text-micro font-bold block ${
                  p.marginPercent < 15 ? "text-rose-600" : p.marginPercent >= 35 ? "text-emerald-600" : "text-gray-500"
                }`}
              >
                {p.marginPercent.toFixed(1)}%
              </span>
            )}
          </div>
        );
      case "effectiveRate":
        return (
          <span className="font-mono text-gray-700 tabular-nums">
            {p.effectiveHourlyRate !== null
              ? `${formatMoney(p.effectiveHourlyRate, p.currency, userLanguage)}/${t("h", "h", "ó")}`
              : "—"}
          </span>
        );
      case "tasksCount":
        return (
          <div className="text-center tabular-nums">
            <span className="font-semibold text-gray-900">{p.tasks.open}</span>
            <span className="text-gray-400"> / {p.tasks.total}</span>
            {p.tasks.overdue > 0 && (
              <span className="block text-micro font-bold text-rose-600">
                {p.tasks.overdue} {t("late", "mešká", "késik")}
              </span>
            )}
          </div>
        );
      case "tasksReopened":
        return (
          <span className={`font-semibold tabular-nums ${p.tasks.reopened > 0 ? "text-amber-700" : "text-gray-400"}`}>
            {p.tasks.reopened}
          </span>
        );
      case "tasksWait":
        return (
          <div className="text-right tabular-nums">
            <span className="text-gray-800 block">{formatWaitDuration(p.tasks.wait.avgSeconds, userLanguage)}</span>
            {p.tasks.wait.waitingNowCount > 0 && (
              <span className="text-micro font-bold text-amber-700 block">
                {p.tasks.wait.waitingNowCount} {t("waiting", "čaká", "vár")}
              </span>
            )}
          </div>
        );
      case "deadlineHealth":
        return (
          <div className="text-center tabular-nums space-y-0.5">
            {p.deadlineStatus?.isOverdue ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-50 text-rose-700 border border-rose-200">
                {p.deadlineStatus.overdueDays}d {t("overdue", "po termíne", "késés")}
              </span>
            ) : p.deadlineStatus ? (
              <span className="text-micro text-gray-500 block">
                {p.deadlineStatus.daysLeft >= 0
                  ? `${p.deadlineStatus.daysLeft}d`
                  : p.deadlineStatus.deadline}
              </span>
            ) : null}
            {p.tasks.deadlineMoves > 0 && (
              <span className="block text-micro font-semibold text-amber-700">
                {p.tasks.deadlineMoves}× {t("slipped", "posun", "csúszás")}
              </span>
            )}
            {!p.deadlineStatus && p.tasks.deadlineMoves === 0 && (
              <span className="text-gray-400">—</span>
            )}
          </div>
        );
      case "ticketsCount":
        return (
          <div className="text-center tabular-nums">
            <span className="font-semibold text-gray-900">{p.tickets.open}</span>
            <span className="text-gray-400"> / {p.tickets.total}</span>
            {p.tickets.slaBreached > 0 && (
              <span className="block text-micro font-bold text-rose-600">
                {p.tickets.slaBreached} SLA
              </span>
            )}
          </div>
        );
      case "ticketsReopened":
        return (
          <span className={`font-semibold tabular-nums ${p.tickets.reopened > 0 ? "text-amber-700" : "text-gray-400"}`}>
            {p.tickets.reopened}
          </span>
        );
      case "ticketsWait":
        return (
          <div className="text-right tabular-nums">
            <span className="text-gray-800 block">{formatWaitDuration(p.tickets.wait.avgSeconds, userLanguage)}</span>
            {p.tickets.wait.waitingNowCount > 0 && (
              <span className="text-micro font-bold text-rose-600 block">
                {p.tickets.wait.waitingNowCount} {t("untouched", "neotv.", "érintetlen")}
              </span>
            )}
          </div>
        );
    }
  };

  const renderEmployeeCell = (colKey: BreakdownColumnKey, emp: BreakdownEmployeeRow, projectCurrency: string) => {
    switch (colKey) {
      case "entity": {
        const initials = emp.name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <div className="flex items-center gap-2.5 pl-13 min-w-56">
            <div className="w-7 h-7 rounded-md bg-gray-100 border border-gray-200 text-gray-700 flex items-center justify-center font-heading font-bold text-micro shrink-0">
              {initials || <User className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {emp.employeeId ? (
                  <a
                    href={`#employee-${encodeURIComponent(emp.employeeId)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-caption text-gray-800 hover:text-entity-text transition truncate"
                  >
                    {emp.name}
                  </a>
                ) : (
                  <span className="font-semibold text-caption text-gray-800 truncate">{emp.name}</span>
                )}
                {emp.kind === "contractor" && (
                  <span className="px-1.5 py-0.5 rounded-full text-micro font-bold bg-gray-100 text-gray-500 border border-gray-200">
                    {t("Contractor", "Dodávateľ", "Alvállalkozó")}
                  </span>
                )}
              </div>
              {emp.effectiveCostRatePerHour !== null && emp.costVisible && (
                <span className="text-micro text-gray-400 tabular-nums block">
                  {formatMoney(emp.effectiveCostRatePerHour, projectCurrency, userLanguage)}/{t("h", "h", "ó")}
                </span>
              )}
            </div>
          </div>
        );
      }
      case "timeWorked":
        return (
          <div className="text-right tabular-nums">
            <span className="font-mono font-semibold text-gray-800 block">{formatHoursShort(emp.seconds)}</span>
            {emp.sharePercent > 0 && (
              <span className="text-micro text-gray-400 block">{emp.sharePercent}%</span>
            )}
          </div>
        );
      case "laborAndSalary":
        return (
          <div className="text-right tabular-nums">
            {emp.costVisible ? (
              <span className="font-mono font-bold text-gray-900 block">
                {emp.laborCost !== null ? formatMoney(emp.laborCost, projectCurrency, userLanguage) : "—"}
              </span>
            ) : (
              <span className="text-gray-400 block">—</span>
            )}
            {emp.salaryVisible && (emp.lastSalaryAmount !== null || (emp.contractSalaryAmount !== null && emp.contractSalaryAmount > 0)) && (
              <span className="text-micro text-gray-500 block">
                {emp.contractSalaryAmount !== null && emp.contractSalaryAmount > 0 && (
                  <>
                    {t("Base", "Základ", "Alap")}: {formatMoney(emp.contractSalaryAmount, defaultCurrency, userLanguage)}
                    {salaryCadenceLabel(emp.contractSalaryType)}
                  </>
                )}
                {emp.lastSalaryAmount !== null && (
                  <>
                    {emp.contractSalaryAmount ? " · " : ""}
                    {t("Last", "Posl.", "Ut.")}: {formatMoney(emp.lastSalaryAmount, defaultCurrency, userLanguage)} ({emp.lastSalaryPeriod})
                  </>
                )}
              </span>
            )}
          </div>
        );
      case "tasksCount":
        return (
          <div className="text-center tabular-nums">
            <span className="font-semibold text-gray-800">{emp.tasks.open}</span>
            <span className="text-gray-400"> / {emp.tasks.total}</span>
            {emp.tasks.overdue > 0 && (
              <span className="block text-micro font-bold text-rose-600">
                {emp.tasks.overdue} {t("late", "mešká", "késik")}
              </span>
            )}
          </div>
        );
      case "tasksReopened":
        return (
          <span className={`tabular-nums ${emp.tasks.reopened > 0 ? "font-bold text-amber-700" : "text-gray-400"}`}>
            {emp.tasks.reopened}
          </span>
        );
      case "tasksWait":
        return (
          <div className="text-right tabular-nums">
            <span className="text-gray-700 block">{formatWaitDuration(emp.tasks.wait.avgSeconds, userLanguage)}</span>
            {emp.tasks.wait.waitingNowCount > 0 && (
              <span className="text-micro font-bold text-amber-700 block">
                {emp.tasks.wait.waitingNowCount} {t("waiting", "čaká", "vár")}
              </span>
            )}
          </div>
        );
      case "deadlineHealth":
        return (
          <div className="text-center tabular-nums">
            {emp.tasks.deadlineMoves > 0 ? (
              <span className="text-micro font-semibold text-amber-700">
                {emp.tasks.deadlineMoves}× {t("slipped", "posun", "csúszás")}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        );
      case "ticketsCount":
        return emp.ticketsCount > 0 ? (
          <div className="text-center tabular-nums">
            <span className="font-semibold text-gray-800">{emp.ticketsOpen}</span>
            <span className="text-gray-400"> / {emp.ticketsCount}</span>
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        );
      case "ticketsReopened":
        return emp.ticketsCount > 0 ? (
          <span className={`tabular-nums ${emp.ticketsReopened > 0 ? "font-bold text-amber-700" : "text-gray-400"}`}>
            {emp.ticketsReopened}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        );
      default:
        return <span className="text-gray-300">—</span>;
    }
  };

  const renderFooterCell = (colKey: BreakdownColumnKey) => {
    switch (colKey) {
      case "entity":
        return (
          <span className="font-heading font-bold text-gray-900">
            {t("Portfolio Total", "Spolu portfólio", "Portfólió összesen")} ({summary.clientCount} {t("clients", "klientov", "ügyfél")} · {summary.projectCount} {t("projects", "projektov", "projekt")})
          </span>
        );
      case "value":
        return <span className="font-mono font-bold text-gray-900">{formatMoneyMap(summary.valueByCurrency, userLanguage, defaultCurrency)}</span>;
      case "invoicable":
        return <span className="font-mono font-bold text-amber-700">{formatMoneyMap(summary.invoicableByCurrency, userLanguage, defaultCurrency, true)}</span>;
      case "stillToBePaid":
        return <span className="font-mono font-bold text-emerald-700">{formatMoneyMap(summary.stillToBePaidByCurrency, userLanguage, defaultCurrency, true)}</span>;
      case "timeWorked":
        return <span className="font-mono font-bold text-gray-900 tabular-nums">{formatHoursShort(summary.totalSeconds)}</span>;
      case "laborAndSalary":
        return (
          <span className="font-mono font-bold text-gray-900 tabular-nums">
            {summary.laborCost !== null ? formatMoney(summary.laborCost, defaultCurrency, userLanguage) : "—"}
          </span>
        );
      case "margin":
        return (
          <div className="text-right tabular-nums">
            <span className="font-mono font-bold text-gray-900 block">
              {formatMoneyMap(summary.marginByCurrency, userLanguage, defaultCurrency)}
            </span>
            {summary.marginPercent !== null && (
              <span className="text-micro font-bold text-gray-600 block">{summary.marginPercent.toFixed(1)}%</span>
            )}
          </div>
        );
      case "effectiveRate":
        return (
          <div className="text-right font-mono font-bold text-gray-800 tabular-nums">
            {Object.keys(summary.effectiveHourlyRateByCurrency).length > 0
              ? Object.entries(summary.effectiveHourlyRateByCurrency).map(([curr, amt]) => (
                  <div key={curr}>
                    {formatMoney(amt, curr, userLanguage)}/{t("h", "h", "ó")}
                  </div>
                ))
              : "—"}
          </div>
        );
      case "tasksCount":
        return (
          <span className="font-bold text-gray-900 tabular-nums">
            {summary.totalTasksOpen} {t("open", "otv.", "nyitott")}
          </span>
        );
      case "tasksReopened":
        return <span className="font-bold text-amber-700 tabular-nums">{summary.totalTasksReopened}</span>;
      case "tasksWait":
        return (
          <span className="font-bold text-amber-700 tabular-nums">
            {summary.totalTasksWaitingNow > 0 ? `${summary.totalTasksWaitingNow} ${t("waiting", "čaká", "vár")}` : "—"}
          </span>
        );
      case "ticketsCount":
        return (
          <span className="font-bold text-gray-900 tabular-nums">
            {summary.totalTicketsOpen} {t("open", "otv.", "nyitott")}
          </span>
        );
      case "ticketsReopened":
        return <span className="font-bold text-amber-700 tabular-nums">{summary.totalTicketsReopened}</span>;
      case "ticketsWait":
        return (
          <span className="font-bold text-rose-600 tabular-nums">
            {summary.totalTicketsWaitingNow > 0 ? `${summary.totalTicketsWaitingNow} ${t("untouched", "neotv.", "érintetlen")}` : "—"}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 mt-4" data-testid="projects-breakdown-view">
      {/* Executive KPI Strip */}
      <div className="grid grid-cols-1 ws-sm:grid-cols-2 ws-lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-2xs">
          <div className="type-overline text-gray-400 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-entity-text" />
            {t("Portfolio Value", "Hodnota portfólia", "Portfólió érték")}
          </div>
          <div className="text-heading font-black text-gray-900 mt-1 tabular-nums">
            {Object.keys(summary.valueByCurrency).length > 0
              ? Object.entries(summary.valueByCurrency).map(([c, a]) => <div key={c}>{formatMoney(a, c, userLanguage)}</div>)
              : formatMoney(0, defaultCurrency, userLanguage)}
          </div>
          <div className="text-micro text-gray-500 mt-1 tabular-nums">
            {summary.clientCount} {t("clients", "klientov", "ügyfél")} · {summary.projectCount} {t("projects", "projektov", "projekt")}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-2xs">
          <div className="type-overline text-gray-400">
            {t("Invoiceable & Unpaid", "Fakturovateľné a neuhradené", "Számlázható és kifizetetlen")}
          </div>
          <div className="text-heading font-black text-emerald-700 mt-1 tabular-nums">
            {Object.keys(summary.stillToBePaidByCurrency).length > 0
              ? Object.entries(summary.stillToBePaidByCurrency).map(([c, a]) => <div key={c}>{formatMoney(a, c, userLanguage)}</div>)
              : formatMoney(0, defaultCurrency, userLanguage)}
          </div>
          <div className="text-micro text-amber-700 font-semibold mt-1 tabular-nums">
            {t("Not invoiced", "Nefakturované", "Számlázatlan")}:{" "}
            {Object.keys(summary.invoicableByCurrency).length > 0
              ? Object.entries(summary.invoicableByCurrency).map(([c, a]) => formatMoney(a, c, userLanguage)).join(" / ")
              : formatMoney(0, defaultCurrency, userLanguage)}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-2xs">
          <div className="type-overline text-gray-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-sky-600" />
            {t("Time & Effective Rate", "Čas a efektívna sadzba", "Idő és effektív díj")}
          </div>
          <div className="text-heading font-black text-gray-900 mt-1 tabular-nums">
            {formatHoursShort(summary.totalSeconds)}
          </div>
          <div className="text-micro text-gray-500 mt-1 tabular-nums">
            {Object.keys(summary.effectiveHourlyRateByCurrency).length > 0
              ? Object.entries(summary.effectiveHourlyRateByCurrency)
                  .map(([c, a]) => `${formatMoney(a, c, userLanguage)}/${t("h", "h", "ó")}`)
                  .join(" · ")
              : t("No logged hours yet", "Zatiaľ bez záznamov", "Még nincs rögzített idő")}
          </div>
        </div>

        {rights.canSeeCosts && rights.canSeeFinance && (
          <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-2xs">
            <div className="type-overline text-gray-400 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              {t("Gross Margin", "Hrubá marža", "Bruttó árrés")}
            </div>
            <div className={`text-heading font-black mt-1 tabular-nums ${summary.marginPercent !== null && summary.marginPercent < 15 ? "text-rose-600" : "text-gray-900"}`}>
              {summary.marginByCurrency && Object.keys(summary.marginByCurrency).length > 0
                ? Object.entries(summary.marginByCurrency).map(([c, a]) => <div key={c}>{formatMoney(a, c, userLanguage)}</div>)
                : "—"}
            </div>
            <div className="text-micro text-gray-500 mt-1 tabular-nums">
              {summary.marginPercent !== null ? `${summary.marginPercent.toFixed(1)}% ${t("margin", "marža", "árrés")}` : t("Partial cost data", "Neúplné náklady", "Részleges költségadat")}
            </div>
          </div>
        )}

        <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-2xs">
          <div className="type-overline text-gray-400 flex items-center gap-1.5">
            <TicketIcon className="h-3.5 w-3.5 text-rose-500" />
            {t("Delivery & Support Risk", "Riziko dodania a podpory", "Szállítási és támogatási kockázat")}
          </div>
          <div className="flex items-baseline gap-2 mt-1 tabular-nums">
            <span className={`text-heading font-black ${summary.overdueProjects > 0 || summary.atRiskProjects > 0 ? "text-rose-600" : "text-emerald-700"}`}>
              {summary.atRiskProjects}
            </span>
            <span className="text-caption text-gray-500">{t("at-risk projects", "rizikových projektov", "kockázatos projekt")}</span>
          </div>
          <div className="text-micro text-gray-500 mt-1 flex items-center gap-2 flex-wrap tabular-nums">
            <span className={summary.totalTasksWaitingNow > 0 ? "text-amber-700 font-bold" : ""}>
              {summary.totalTasksWaitingNow} {t("tasks queued", "úloh čaká", "feladat vár")}
            </span>
            <span>·</span>
            <span className={summary.totalTasksReopened + summary.totalTicketsReopened > 0 ? "text-amber-700 font-bold" : ""}>
              {summary.totalTasksReopened + summary.totalTicketsReopened} {t("reopened", "znovuotv.", "újranyitva")}
            </span>
            {summary.totalTicketsSlaBreached > 0 && (
              <>
                <span>·</span>
                <span className="text-rose-600 font-bold">{summary.totalTicketsSlaBreached} SLA</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {healthPills.map((pill) => {
            const active = healthFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => onHealthFilterChange(pill.id)}
                className={`px-2.5 py-1 rounded-full text-caption font-semibold border transition cursor-pointer ${
                  active
                    ? "bg-entity-solid border-entity-solid text-white shadow-2xs"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36 shrink-0">
            <CustomSelect
              className="h-8"
              value={periodPreset}
              onChange={(v) => onPeriodPresetChange(v as BreakdownPeriodPreset)}
              options={[
                { value: "all", label: t("All time", "Celé obdobie", "Teljes időszak") },
                { value: "this_month", label: t("This month", "Tento mesiac", "Ez a hónap") },
                { value: "last_month", label: t("Last month", "Minulý mesiac", "Előző hónap") },
                { value: "this_quarter", label: t("This quarter", "Tento kvartál", "Ez a negyedév") },
                { value: "this_year", label: t("This year", "Tento rok", "Idei év") },
              ]}
            />
          </div>

          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-gray-100 border border-gray-200">
            {([
              { id: "all" as const, label: t("All KPIs", "Všetky KPI", "Összes KPI") },
              { id: "financial" as const, label: t("Finance", "Financie", "Pénzügy") },
              { id: "delivery" as const, label: t("Delivery", "Dodanie", "Teljesítés") },
            ]).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset.id)}
                className="px-2 py-1 rounded-sm text-micro font-semibold text-gray-600 hover:text-gray-900 hover:bg-white transition cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandClientsOnly}
              title={t("Expand clients to projects", "Rozbaliť klientov na projekty", "Ügyfelek kibontása projektekre")}
              className="px-2 py-1 rounded-md text-micro font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              {t("Projects", "Projekty", "Projektek")}
            </button>
            <button
              type="button"
              onClick={expandAllLevels}
              title={t("Expand all levels", "Rozbaliť všetko", "Összes kibontása")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-micro font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              {t("Expand all", "Rozbaliť všetko", "Összes")}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              title={t("Collapse all", "Zbaliť všetko", "Összes bezárása")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-micro font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
              {t("Collapse", "Zbaliť", "Bezárás")}
            </button>
          </div>
          {loadingTime && <RefreshCw className="h-3.5 w-3.5 text-gray-400 animate-spin" />}
        </div>
      </div>

      {/* 3-Level Expandable Hierarchy Table */}
      {clients.length === 0 ? (
        <div className="p-10 rounded-lg border border-gray-200 bg-white text-center text-gray-400 shadow-xs">
          <p className="text-body font-semibold">
            {t(
              "No clients or projects match your current filters.",
              "Aktuálnym filtrom nezodpovedajú žiadni klienti ani projekty.",
              "A jelenlegi szűrőknek nem felel meg egyetlen ügyfél vagy projekt sem.",
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-xs overflow-clip">
          <div ref={tableWrapRef} className="table-page-wrap">
            <table className="w-full text-left text-ui border-collapse">
              <thead className="table-page-sticky-head">
                <tr className="border-b border-gray-200/80 bg-gray-50 text-gray-500 type-overline">
                  {visibleColumns.map((col, idx) => {
                    const def = colMetaMap.get(col.key);
                    const alignCls = def?.align === "right" ? "text-right" : def?.align === "center" ? "text-center" : "text-left";
                    return (
                      <th
                        key={col.key}
                        className={`sticky z-20 bg-gray-50 py-3 px-3.5 whitespace-nowrap ${alignCls} ${
                          idx === 0 ? "left-0 z-30 border-r border-gray-200/70" : ""
                        }`}
                      >
                        {columnLabel(col.key)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => {
                  const isClientExpanded = expandedClients.has(client.key);
                  return (
                    <React.Fragment key={client.key}>
                      {/* LEVEL 1: CLIENT ROW */}
                      <tr
                        onClick={() => toggleClient(client.key)}
                        className="bg-white hover:bg-gray-500/5 cursor-pointer transition"
                        data-breakdown-client={client.key}
                      >
                        {visibleColumns.map((col, idx) => {
                          const def = colMetaMap.get(col.key);
                          const alignCls = def?.align === "right" ? "text-right" : def?.align === "center" ? "text-center" : "text-left";
                          return (
                            <td
                              key={col.key}
                              className={`py-3 px-3.5 ${alignCls} ${
                                idx === 0 ? "sticky left-0 z-10 bg-white border-r border-gray-100" : ""
                              }`}
                            >
                              {renderClientCell(col.key, client)}
                            </td>
                          );
                        })}
                      </tr>

                      {/* LEVEL 2: PROJECT ROWS */}
                      {isClientExpanded &&
                        client.projects.map((proj) => {
                          const isProjExpanded = expandedProjects.has(proj.project.id);
                          return (
                            <React.Fragment key={proj.project.id}>
                              <tr
                                onClick={() => {
                                  if (proj.employees.length > 0) toggleProject(proj.project.id);
                                  else onSelectProject(proj.project.id);
                                }}
                                className="bg-gray-50/70 hover:bg-entity-subtle/40 cursor-pointer transition"
                                data-breakdown-project={proj.project.id}
                              >
                                {visibleColumns.map((col, idx) => {
                                  const def = colMetaMap.get(col.key);
                                  const alignCls = def?.align === "right" ? "text-right" : def?.align === "center" ? "text-center" : "text-left";
                                  return (
                                    <td
                                      key={col.key}
                                      className={`py-2.5 px-3.5 ${alignCls} ${
                                        idx === 0 ? "sticky left-0 z-10 bg-gray-50 border-r border-gray-200/70" : ""
                                      }`}
                                    >
                                      {renderProjectCell(col.key, proj)}
                                    </td>
                                  );
                                })}
                              </tr>

                              {/* LEVEL 3: EMPLOYEE ROWS */}
                              {isProjExpanded &&
                                proj.employees.map((emp) => (
                                  <tr
                                    key={`${proj.project.id}:${emp.key}`}
                                    className="bg-slate-50/60 hover:bg-slate-100/70 transition"
                                    data-breakdown-employee={emp.key}
                                  >
                                    {visibleColumns.map((col, idx) => {
                                      const def = colMetaMap.get(col.key);
                                      const alignCls = def?.align === "right" ? "text-right" : def?.align === "center" ? "text-center" : "text-left";
                                      return (
                                        <td
                                          key={col.key}
                                          className={`py-2 px-3.5 ${alignCls} ${
                                            idx === 0 ? "sticky left-0 z-10 bg-slate-50 border-r border-gray-200/70" : ""
                                          }`}
                                        >
                                          {renderEmployeeCell(col.key, emp, proj.currency)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                            </React.Fragment>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/95">
                  {visibleColumns.map((col, idx) => {
                    const def = colMetaMap.get(col.key);
                    const alignCls = def?.align === "right" ? "text-right" : def?.align === "center" ? "text-center" : "text-left";
                    return (
                      <td
                        key={col.key}
                        className={`py-3 px-3.5 ${alignCls} ${
                          idx === 0 ? "sticky left-0 z-10 bg-gray-50 border-r border-gray-200/70" : ""
                        }`}
                      >
                        {renderFooterCell(col.key)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          <StickyHScrollbar target={tableWrapEl} />
        </div>
      )}
    </div>
  );
};
