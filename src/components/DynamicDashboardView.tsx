import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ChevronDown,
  Copy,
  FileText,
  History,
  Info,
  Languages,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Grip,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Check,
  Pencil,
  Briefcase,
  Receipt
} from "lucide-react";
import type {
  CustomDashboard,
  Lead,
  Project,
  ProjectType,
  FinancialRecord,
  InvoiceOffer,
  ProjectStatus
} from "../types";
import { cn } from "../utils/cn";
import type { Language } from "../utils/translations";
import {
  formatMoney,
  isMoneyValueEmpty,
  parseMoneyValue,
  currencyForRegion
} from "../utils/currency";
import { isClosedLeadState } from "../utils/leadSla";
import {
  CLOSED_PROJECT_STATUSES,
  projectStatusOrder,
  projectStatusLabel
} from "../utils/projects";
import {
  GroupedStatusValueEquationStats,
  type StatusStatGroup,
  type StatusStatItem,
  type StatusStatDetailRow,
} from "./GroupedStatusValueEquationStats";
import { localeCodeFor } from "../utils/localTime";
import { chartTheme, useAppearance } from "../utils/theme";
import { useDragAutoScroll } from "../hooks/useDragAutoScroll";
import { useGridFlip } from "../hooks/useGridFlip";
import {
  GRID_COLUMNS,
  breakpointForWidth,
  freeDropTargets,
  insertAt,
  planGrid,
  rowCountOf,
  type GridItem
} from "../utils/dashboardGrid";
import { FULL_MODULE_ACCESS, type ModuleAccess } from "../utils/permissions";
import {
  WIDGET_SIZES,
  WIDGET_SIZE_LABELS,
  applySettingsToQuery,
  buildPresetWidget,
  buildDefaultHomeWidgets,
  fetchParamsOf,
  newWidgetId,
  presetOfWidget,
  rendererOfWidget,
  sectionOfWidget,
  settingsOfWidget,
  type WidgetPreset,
  type WidgetSettings,
  type WidgetSize
} from "../utils/dashboardWidgets";
import { WidgetCard, type Translate } from "./dashboard/widgetKit";
import {
  LeadsTableWidget,
  MetricWidget,
  OpenTasksWidget,
  SourceBarsWidget,
  StageDonutWidget,
  TaskStatusWidget,
  TasksTableWidget,
  type WidgetRenderContext
} from "./dashboard/presetWidgets";
import { AddWidgetDrawer } from "./dashboard/AddWidgetDrawer";
import { WidgetSettingsDrawer } from "./dashboard/WidgetSettingsDrawer";

interface DynamicDashboardViewProps {
  dashboard: CustomDashboard;
  onSaveDashboard: (updated: CustomDashboard) => void;
  systemLanguage: string;
  currencyCode?: string | null;
  /**
   * "home" is the built-in Dashboard section: it keeps its own heading and can
   * be reset back to the starter widgets. "custom" is a user-created AI panel.
   */
  variant?: "custom" | "home";
  /**
   * Every configured pipeline phase, in pipeline order. A stage-by-phase widget
   * can only ever report the phases leads actually sit in, so the editor's phase
   * picker needs the full list from Settings to offer the empty ones too.
   */
  pipelineStages?: string[];
  /** Role access for this dashboard. `edit: false` is view-only widgets. */
  access?: ModuleAccess;
  /* --- What the designed cards paint with. All configured in Settings, so a
     card never invents a colour: a phase badge here is the same blue as the
     same phase on the sales board. --- */
  leadStateColors?: Record<string, string> | null;
  leadSourceColors?: Record<string, string> | null;
  taskStates?: string[];
  taskStateColors?: Record<string, string> | null;
  /** Whose tasks the task table's "Mine" means. */
  currentUserName?: string;
  /** Opens another section — the "See all" links and the table rows. */
  onNavigate?: (route: string) => void;
  leads?: Lead[];
  projects?: Project[];
  projectTypes?: ProjectType[];
  financialRecords?: FinancialRecord[];
  invoicesOffers?: InvoiceOffer[];
  leadStageGroups?: Record<string, "new" | "in_progress" | "closed">;
  leadStateParents?: Record<string, string>;
}

/** Where a `tabs` widget's per-tab query result is stored in the data/error maps. */
const tabDataKey = (widgetId: string, index: number) => `${widgetId}::tab${index}`;

const WIDGET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  metric: LayoutDashboard,
  chart: Sparkles,
  table: FileText,
  timeline: History,
  accordion: Rows3,
  tabs: Layers
};

const WIDGET_TYPES = ["metric", "chart", "table", "timeline", "accordion", "tabs"];

/**
 * The types the settings drawer offers for an AI-generated widget. `tabs` is
 * rendered but not offered: it holds one query per tab rather than a query of
 * its own, so switching an existing widget to it by hand would produce a card
 * with nothing to show.
 */
const EDITABLE_WIDGET_TYPES = ["metric", "chart", "table", "timeline", "accordion"];

/**
 * Every chart flavour the renderer understands (keys are `canonical()`-ed), mapped
 * to the Chart.js controller that actually draws it. "gauge" has no controller and
 * is rendered natively by GaugeWidget.
 */
const CHART_BASE_TYPES: Record<string, string> = {
  bar: "bar",
  horizontalbar: "bar",
  line: "line",
  area: "line",
  pie: "pie",
  doughnut: "doughnut",
  polararea: "polarArea",
  radar: "radar",
  scatter: "scatter",
  bubble: "bubble"
};

const CHART_TYPES = [...Object.keys(CHART_BASE_TYPES), "gauge"];

const canonical = (value: any) => String(value ?? "").toLowerCase().replace(/[\s_-]/g, "");

/** The one query action whose rows are a pipeline breakdown. */
const STAGE_QUERY_ACTION = "leads_by_status";

/** Solid accent for the widget palette names the AI is allowed to pick from. */
const ACCENT_COLORS: Record<string, string> = {
  indigo: "#4f46e5",
  blue: "#2563eb",
  emerald: "#059669",
  purple: "#8b5cf6",
  amber: "#d97706",
  rose: "#e11d48",
  cyan: "#0891b2",
  pink: "#db2777"
};

const accentFor = (color: any) => ACCENT_COLORS[String(color || "indigo")] || ACCENT_COLORS.indigo;

/** A rectangle inside the board, in pixels relative to the grid container. */
interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** An empty run of cells the dragged card fits in, measured on screen. */
interface DropZone extends BoardRect {
  insertIndex: number;
}

/**
 * Everything a drag needs to carry between pointer events. It lives in a ref
 * rather than in state: the card follows the cursor by having its transform
 * written directly, which must not cost a render per frame.
 */
interface DragSession {
  id: string;
  /** Where inside the card the pointer took hold of it. */
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  /** Current position of the card, in viewport pixels. */
  x: number;
  y: number;
  /**
   * Where the fixed card's own coordinate space begins, in viewport pixels.
   * Normally the viewport itself, but any transformed or blurred ancestor
   * becomes the containing block instead, so it is measured rather than
   * assumed — getting it wrong offsets the card from the cursor.
   */
  originX: number;
  originY: number;
  zones: DropZone[];
  cards: (BoardRect & { id: string })[];
  measured: boolean;
  /** The drop the pointer is currently over: empty cells, or another card. */
  dropIndex: number | null;
  dropCardId: string | null;
}

/** The twelve-column span each width takes, at the desktop breakpoint. */
const SPAN_CLASS: Record<WidgetSize, string> = {
  sm: "col-span-12 md:col-span-6 lg:col-span-3",
  md: "col-span-12 md:col-span-6 lg:col-span-4",
  lg: "col-span-12 lg:col-span-8",
  full: "col-span-12"
};

const sizeOf = (widget: any): WidgetSize =>
  (WIDGET_SIZES as string[]).includes(widget?.size) ? (widget.size as WidgetSize) : "full";

/** Cycles S → M → L → XL → S; what the corner grip on a card does. */
const nextSize = (size: WidgetSize): WidgetSize =>
  WIDGET_SIZES[(WIDGET_SIZES.indexOf(size) + 1) % WIDGET_SIZES.length];

/**
 * Decides which renderer a widget belongs to. The model is told to emit
 * `type` + `chartType`, but in practice it also writes `type: "radar"` or omits
 * `type` entirely — infer rather than render an empty card.
 */
const resolveWidgetType = (w: any): { type: string; widget: any } => {
  const raw = canonical(w?.type);
  if (WIDGET_TYPES.includes(raw)) return { type: raw, widget: w };
  if (raw === "kpi" || raw === "counter" || raw === "stat") return { type: "metric", widget: w };
  if (raw === "list") return { type: "table", widget: w };
  if (CHART_TYPES.includes(raw)) {
    return { type: "chart", widget: { ...w, chartType: w?.chartType || raw } };
  }
  if (Array.isArray(w?.tabs) && w.tabs.length > 0) return { type: "tabs", widget: w };
  if (w?.chartType) return { type: "chart", widget: w };
  if (Array.isArray(w?.columns) && w.columns.length > 0) return { type: "table", widget: w };
  return { type: "metric", widget: w };
};

/**
 * Picks the first row key that looks like the requested role, so timeline and
 * accordion widgets still render when the model omits the `mapping` block.
 */
const pickKey = (row: any, explicit: any, candidates: string[]): string | null => {
  if (explicit && row && Object.prototype.hasOwnProperty.call(row, explicit)) return explicit;
  if (!row || typeof row !== "object") return null;
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const hit = keys.find(k => k.toLowerCase() === candidate);
    if (hit) return hit;
  }
  for (const candidate of candidates) {
    const hit = keys.find(k => k.toLowerCase().includes(candidate));
    if (hit) return hit;
  }
  return null;
};

/** First key in a sample row whose values look numeric — the natural series. */
const numericKeyOf = (row: any): string | null => {
  if (!row || typeof row !== "object") return null;
  const hit = Object.keys(row).find(k => row[k] !== null && row[k] !== "" && !isNaN(Number(row[k])));
  return hit || null;
};

/** First key that is not the numeric one — the natural label/category. */
const labelKeyOf = (row: any, numericKey: string | null): string | null => {
  if (!row || typeof row !== "object") return null;
  const keys = Object.keys(row);
  return keys.find(k => k !== numericKey) || keys[0] || null;
};

/**
 * Rewrites a widget so it can render as `nextType`.
 *
 * A widget carries the fields its own renderer needs and nothing more — a chart
 * has `mapping`, a table has `columns` — so switching type in the editor has to
 * fill in the missing half. `sampleRow` is the first row the widget's query
 * actually returned, which is what makes the guesses land on real column names
 * instead of placeholders.
 */
const adaptWidgetToType = (widget: any, nextType: string, sampleRow: any): any => {
  const next = { ...widget, type: nextType };
  const numericKey = numericKeyOf(sampleRow);
  const labelKey = labelKeyOf(sampleRow, numericKey);

  if (nextType === "chart") {
    next.chartType = CHART_TYPES.includes(canonical(widget.chartType)) ? widget.chartType : "bar";
    const mapping = { ...(widget.mapping || {}) };
    if (!mapping.labelsKey && labelKey) mapping.labelsKey = labelKey;
    if (!mapping.dataKey && numericKey) mapping.dataKey = numericKey;
    next.mapping = mapping;
  }

  if (nextType === "metric") {
    // A metric shows one figure out of the first row, and the row's first column
    // is rarely it — a phase breakdown leads with the phase name. Point the card
    // at the first numeric column instead.
    const mapping = { ...(widget.mapping || {}) };
    if (!mapping.dataKey && numericKey) mapping.dataKey = numericKey;
    next.mapping = mapping;
  }

  if (nextType === "table") {
    if (!Array.isArray(widget.columns) || widget.columns.length === 0) {
      const keys = sampleRow && typeof sampleRow === "object" ? Object.keys(sampleRow).slice(0, 5) : [];
      next.columns = keys.map(key => {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        return {
          key,
          // Derived from a database column name, so the same text stands in for
          // all three languages rather than leaving the label untranslated.
          label: { en: label, sk: label, hu: label },
          format: /value|price|total|amount|worth|revenue/i.test(key)
            ? "currency"
            : /date|_at|deadline/i.test(key)
              ? "date"
              : "text"
        };
      });
    }
  }

  if (nextType === "timeline" || nextType === "accordion") {
    const mapping = { ...(widget.mapping || {}) };
    mapping.titleKey = pickKey(sampleRow, mapping.titleKey, TITLE_KEY_CANDIDATES) || mapping.titleKey;
    if (nextType === "timeline") {
      mapping.dateKey = pickKey(sampleRow, mapping.dateKey, DATE_KEY_CANDIDATES) || mapping.dateKey;
      mapping.descriptionKey = pickKey(sampleRow, mapping.descriptionKey, BODY_KEY_CANDIDATES) || mapping.descriptionKey;
    } else {
      mapping.contentKey = pickKey(sampleRow, mapping.contentKey, BODY_KEY_CANDIDATES) || mapping.contentKey;
      mapping.subtitleKey = pickKey(sampleRow, mapping.subtitleKey, DATE_KEY_CANDIDATES) || mapping.subtitleKey;
    }
    next.mapping = mapping;
  }

  return next;
};

export const DynamicDashboardView: React.FC<DynamicDashboardViewProps> = ({
  dashboard,
  onSaveDashboard: onSaveDashboardRaw,
  systemLanguage,
  currencyCode,
  variant = "custom",
  pipelineStages = [],
  access = FULL_MODULE_ACCESS,
  leadStateColors = null,
  leadSourceColors = null,
  taskStates = [],
  taskStateColors = null,
  currentUserName = "",
  onNavigate,
  leads = [],
  projects = [],
  projectTypes = [],
  financialRecords = [],
  invoicesOffers = [],
  leadStageGroups = {},
  leadStateParents = {},
}) => {
  const isHome = variant === "home";
  const t: Translate = (en, sk, hu) => (systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en);
  const canEdit = access.edit;
  const canDelete = access.delete;
  const onSaveDashboard = (updated: CustomDashboard) => {
    if (!canEdit) return;
    onSaveDashboardRaw(updated);
  };
  const defaultCurrency = currencyCode || currencyForRegion(systemLanguage as Language);
  const money = (value: number, opts?: Intl.NumberFormatOptions) =>
    formatMoney(value, currencyCode, (systemLanguage as Language) || "en", opts);
  const navigate = (route: string) => {
    if (onNavigate) onNavigate(route);
    else window.location.hash = route;
  };

  // Leads group items calculation
  const leadGroupItems = useMemo<StatusStatItem[]>(() => {
    if (!leads || leads.length === 0) return [];
    const stages =
      pipelineStages && pipelineStages.length > 0
        ? pipelineStages
        : Array.from(new Set(leads.map((l) => l.status || "new")));
    const stageGroups = leadStageGroups || {};
    const stateParents = leadStateParents || {};

    const activeStates = stages.filter(
      (s) =>
        !stateParents[s.toLowerCase()] &&
        !isClosedLeadState(s, stageGroups, stateParents)
    );

    return activeStates.map((state) => {
      const stateLower = state.toLowerCase();
      const leadsInState = leads.filter((l) => {
        const sKey = (l.status || "").toLowerCase();
        const parent = stateParents[sKey];
        const target = parent ? parent.toLowerCase() : sKey;
        return target === stateLower;
      });

      const val = leadsInState.reduce(
        (sum, l) => sum + (Number(l.value) || 0),
        0
      );
      const col =
        leadStateColors?.[stateLower] || leadStateColors?.[state] || "#3b82f6";

      const rows: StatusStatDetailRow[] = leadsInState.map((l) => {
        const lVal = Number(l.value) || 0;
        return {
          id: l.id,
          name: l.name || `Lead #${l.id}`,
          clientName: l.contactPerson || l.name,
          manager: l.owner,
          division: l.division,
          date: l.createdAt ? new Date(l.createdAt).toLocaleDateString() : undefined,
          totalBudget: lVal,
          invoiced: 0,
          invoicable: lVal,
          type: "lead",
          url: `#leads?lead=${encodeURIComponent(l.id)}`,
        };
      });

      return {
        key: stateLower,
        name: state.toUpperCase(),
        value: val,
        count: leadsInState.length,
        color: col,
        rows,
      };
    });
  }, [leads, pipelineStages, leadStageGroups, leadStateParents, leadStateColors]);

  // Projects group items calculation + Remaining Invoicable Calculation
  const {
    projectGroupItems,
    remainingInvoicableValue,
    totalProjectBudgetValue,
    totalInvoicedValue,
  } = useMemo(() => {
    if (!projects || projects.length === 0) {
      return {
        projectGroupItems: [],
        remainingInvoicableValue: 0,
        totalProjectBudgetValue: 0,
        totalInvoicedValue: 0,
      };
    }

    const activeStatuses: ProjectStatus[] = (
      projectStatusOrder() as ProjectStatus[]
    ).filter((s) => !CLOSED_PROJECT_STATUSES.includes(s));

    const statusColors: Record<string, string> = {
      new: "#0284c7",
      active: "#9333ea",
      on_hold: "#d97706",
    };

    let totalProjectBudgetValue = 0;
    let totalInvoicedValue = 0;

    const projectGroupItems: StatusStatItem[] = activeStatuses.map((status) => {
      const projectsInStatus = projects.filter((p) => p.status === status);
      let statusInvoicableVal = 0;
      let statusTotalBudgetValue = 0;
      let statusTotalInvoicedValue = 0;
      const statusRows: StatusStatDetailRow[] = [];

      projectsInStatus.forEach((p) => {
        const pType = (projectTypes || []).find((t) => t.id === p.projectTypeId);
        const moneyAttrs =
          pType?.attributes?.filter((a) => a.type === "money") || [];
        let pVal = 0;
        let hasMoneyVal = false;
        for (const attr of moneyAttrs) {
          const raw = p.data?.[attr.id];
          if (
            raw !== undefined &&
            raw !== null &&
            !isMoneyValueEmpty(raw, defaultCurrency)
          ) {
            const parsed = parseMoneyValue(raw, defaultCurrency);
            if (parsed.amount) {
              pVal += parsed.amount;
              hasMoneyVal = true;
            }
          }
        }
        if (!hasMoneyVal && p.leadId && leads) {
          const pairedLead = leads.find((l) => l.id === p.leadId);
          if (pairedLead?.value) {
            pVal = Number(pairedLead.value) || 0;
            hasMoneyVal = true;
          }
        }
        if (!hasMoneyVal && p.budget) {
          pVal = Number(p.budget) || 0;
        }

        // Calculate invoiced on this project
        let pInvoiced = 0;
        if (financialRecords && financialRecords.length > 0) {
          const pFinRecords = financialRecords.filter(
            (r) => r.projectId === p.id && r.type === "income"
          );
          pInvoiced = pFinRecords.reduce(
            (sum, r) =>
              sum + (Number(r.amountReal) || Number(r.amountPlanned) || 0),
            0
          );
        } else if (invoicesOffers && invoicesOffers.length > 0) {
          const pInvoices = invoicesOffers.filter(
            (io) =>
              p.leadId &&
              io.leadId === p.leadId &&
              io.type === "invoice" &&
              io.status !== "cancelled"
          );
          pInvoiced = pInvoices.reduce(
            (sum, io) => sum + (Number(io.totalPrice) || 0),
            0
          );
        }

        const pInvoicable = Math.max(0, pVal - pInvoiced);

        statusInvoicableVal += pInvoicable;
        statusTotalBudgetValue += pVal;
        statusTotalInvoicedValue += pInvoiced;

        totalProjectBudgetValue += pVal;
        totalInvoicedValue += pInvoiced;

        const leadName =
          p.leadId && leads ? leads.find((l) => l.id === p.leadId)?.name : undefined;

        statusRows.push({
          id: p.id,
          name: p.name || `Project #${p.id}`,
          clientName: leadName || p.name || `Project #${p.id}`,
          manager: p.managers?.[0],
          division: p.division,
          date: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : undefined,
          totalBudget: pVal,
          invoiced: pInvoiced,
          invoicable: pInvoicable,
          type: "project",
          url: `#projects?edit=${encodeURIComponent(p.id)}`,
        });
      });

      return {
        key: status,
        name: projectStatusLabel(status, t).toUpperCase(),
        value: statusInvoicableVal,
        count: projectsInStatus.length,
        color: statusColors[status] || "#9333ea",
        totalBudget: statusTotalBudgetValue,
        invoiced: statusTotalInvoicedValue,
        rows: statusRows,
      };
    });

    const remainingInvoicableValue = Math.max(
      0,
      totalProjectBudgetValue - totalInvoicedValue
    );

    return {
      projectGroupItems,
      remainingInvoicableValue,
      totalProjectBudgetValue,
      totalInvoicedValue,
    };
  }, [
    projects,
    projectTypes,
    leads,
    financialRecords,
    invoicesOffers,
    defaultCurrency,
    t,
  ]);

  const dashboardEquationGroups: StatusStatGroup[] = useMemo(() => {
    const list: StatusStatGroup[] = [];

    if (leadGroupItems.length > 0) {
      list.push({
        id: "leads",
        name: t("Sales & Pipeline", "Obchody a Pipeline", "Értékesítés és Pipeline"),
        subtitle: t(
          "Active phase values in sales funnel",
          "Hodnoty aktívnych fáz obchodného lievika",
          "Aktív értékesítési fázisok"
        ),
        icon: Layers,
        colorTheme: "blue",
        items: leadGroupItems,
        unitLabel: t("leads", "leadov", "lead"),
      });
    }

    if (projectGroupItems.length > 0) {
      list.push({
        id: "projects",
        name: t("Projects & Deliverables", "Projekty a Realizácie", "Projektek és Kivitelezés"),
        subtitle: t(
          "Active project budgets & scopes",
          "Rozpočty a rozsah aktívnych projektov",
          "Aktív projektek költségvetése"
        ),
        icon: Briefcase,
        colorTheme: "purple",
        items: projectGroupItems,
        unitLabel: t("projects", "projektov", "projekt"),
        extraHighlight: {
          label: t(
            "Remaining Invoicable",
            "Zostáva vyfakturovať",
            "Hátralévő számlázható összeg"
          ),
          value: remainingInvoicableValue,
          subtext: `${t(
            "Total Project Budgets:",
            "Rozpočet projektov:",
            "Projektek büdzséje:"
          )} ${formatMoney(
            totalProjectBudgetValue,
            defaultCurrency,
            (systemLanguage as Language) || "en",
            { minimumFractionDigits: 0, maximumFractionDigits: 0 }
          )} · ${t("Invoiced so far:", "Vyfakturované:", "Számlázva:")} ${formatMoney(
            totalInvoicedValue,
            defaultCurrency,
            (systemLanguage as Language) || "en",
            { minimumFractionDigits: 0, maximumFractionDigits: 0 }
          )}`,
          icon: Receipt,
        },
      });
    }

    return list;
  }, [
    leadGroupItems,
    projectGroupItems,
    remainingInvoicableValue,
    totalProjectBudgetValue,
    totalInvoicedValue,
    defaultCurrency,
    systemLanguage,
    t,
  ]);
  // AI-generated widget titles/column labels come back either as a plain
  // string (legacy panels, or a model that ignored the schema) or as an
  // { en, sk, hu } object — pick the current app language, falling back
  // through the other translations rather than showing nothing.
  const localize = (value: any): string => {
    if (value && typeof value === "object") {
      return value[systemLanguage] || value.en || value.sk || value.hu || Object.values(value)[0] as string || "";
    }
    return value ?? "";
  };

  /**
   * What a widget IS, independent of what it has been renamed to: the library
   * preset's name, the title the AI first gave it, or failing both the plain
   * widget type. Shown in the settings drawer and used as the title whenever
   * the user leaves their own name empty.
   */
  const typeTitleOf = (widget: any): any =>
    presetOfWidget(widget)?.title ?? widget?.baseTitle ?? widget?.title ?? null;
  const typeNameOf = (widget: any): string =>
    localize(typeTitleOf(widget)) || widgetTypeLabel(resolveWidgetType(widget).type, t);
  const displayTitleOf = (widget: any): string =>
    localize(widget?.title).trim() || typeNameOf(widget);
  // A widget/column whose title/label is still a plain string predates the
  // { en, sk, hu } schema (or came from a model that ignored it) — those are
  // the only ones that still need translating; freshly generated widgets
  // already carry all three languages.
  const hasLegacyText = (layout: any): boolean => {
    const isLegacy = (v: any) => typeof v === "string" && v.trim() !== "";
    const widgets = layout?.widgets || [];
    return widgets.some((w: any) => {
      if (isLegacy(w?.title)) return true;
      if (Array.isArray(w?.columns) && w.columns.some((c: any) => isLegacy(c?.label))) return true;
      if (Array.isArray(w?.tabs) && w.tabs.some((tab: any) =>
        isLegacy(tab?.label) || isLegacy(tab?.title) ||
        (Array.isArray(tab?.columns) && tab.columns.some((c: any) => isLegacy(c?.label)))
      )) return true;
      return false;
    });
  };

  const [isEditMode, setIsEditMode] = useState(canEdit && dashboard.layout.widgets.length === 0);
  const [promptText, setPromptText] = useState("");
  const [selectedModel, setSelectedModel] = useState(dashboard.activeModel || "gpt-5.6-terra");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [loadingWidgets, setLoadingWidgets] = useState<Record<string, boolean>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [isSaved, setIsSaved] = useState(true);

  const models = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"];
  const modelIndex = models.indexOf(selectedModel);
  const handleModelSliderChange = (val: number) => {
    setSelectedModel(models[val] || "gpt-5.6-terra");
  };
  // Driven by slider position (not the selectedModel string) so dashboards saved
  // before models were renamed to the gpt-5.6 family (e.g. a stored "gpt-4o")
  // still show a level that matches where the slider thumb actually sits.
  const modelLevelIndex = modelIndex >= 0 ? modelIndex : 1;
  const modelLevelLabel = [
    t("Simple", "Jednoduchý", "Egyszerű"),
    t("Smart", "Inteligentný", "Okos"),
    t("Expert", "Expert", "Szakértő")
  ][modelLevelIndex];

  // Temporary layout workspace before saving
  const [tempLayout, setTempLayout] = useState(dashboard.layout);
  const [tempPrompts, setTempPrompts] = useState(dashboard.prompts || []);

  // Manual widget editor: the "add widget" drawer, the settings drawer, and the
  // card being dragged.
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [widgetPrompt, setWidgetPrompt] = useState("");
  const [isGeneratingWidget, setIsGeneratingWidget] = useState(false);
  const [widgetPromptError, setWidgetPromptError] = useState<string | null>(null);
  const [settingsWidgetId, setSettingsWidgetId] = useState<string | null>(null);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  const [dropZones, setDropZones] = useState<DropZone[]>([]);
  const [activeZone, setActiveZone] = useState<number | null>(null);

  /**
   * The toggles on a card's own heading — "Newest / Highest value", "Mine /
   * Whole team" — are a way of *looking* at the panel, not a change to it. They
   * are held here instead of in the layout so using one re-runs the query
   * without putting the dashboard into an unsaved state.
   */
  const [viewOverrides, setViewOverrides] = useState<Record<string, WidgetSettings>>({});

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Long layouts: keep <main> scrolling while a card is dragged near its edges.
  useDragAutoScroll(draggedWidgetId !== null, rootRef);

  const prevDashIdRef = useRef(dashboard.id);

  /**
   * Per-widget (and per-tab) query fingerprint from the last fetch, so a
   * card's own view toggle re-fetches only that card instead of every widget
   * on the board — see the effect below that keys off `querySignature`.
   */
  const prevQueriesRef = useRef<Record<string, string>>({});

  // The background sync hands this view a fresh `dashboard` object on every
  // poll, so this effect runs every few seconds. It may refresh the working
  // layout while nothing is unsaved, but only switching to another dashboard
  // leaves edit mode — resetting it here on every poll threw the user out of
  // edit mode at random whenever they had not changed anything yet.
  useEffect(() => {
    const switched = dashboard.id !== prevDashIdRef.current;
    if (switched || isSaved) {
      setTempLayout(dashboard.layout);
      setTempPrompts(dashboard.prompts || []);
      if (switched) {
        setIsEditMode(canEdit && dashboard.layout.widgets.length === 0);
        setViewOverrides({});
        setSettingsWidgetId(null);
        prevQueriesRef.current = {};
      }
      setIsSaved(true);
      prevDashIdRef.current = dashboard.id;
    }
  }, [dashboard, isSaved]);

  /**
   * What is actually on screen: the saved layout with any view-mode override
   * folded into both the settings and the query. Everything downstream — the
   * fetch, the renderers, the grid — reads this, and every *edit* still writes
   * to `tempLayout` by widget id.
   */
  const widgets: any[] = useMemo(() => {
    const list = tempLayout?.widgets || [];
    return list.map((w: any) => {
      const override = viewOverrides[w.id];
      if (!override) return w;
      return applySettingsToQuery(w, { ...settingsOfWidget(w), ...override }, currentUserName);
    });
  }, [tempLayout, viewOverrides, currentUserName]);

  // Load data for all widgets in the layout. A `tabs` widget holds one query per
  // tab rather than a single query of its own, so results are keyed by a data key
  // (the widget id, or `${widget.id}::tab${i}`) instead of plainly by widget id.
  const fetchAllWidgetsData = async (widgetsToLoad: any[], onlyKeys?: Set<string>) => {
    const jobs: { key: string; query: any }[] = [];
    widgetsToLoad.forEach((w: any) => {
      if (w?.query?.action) jobs.push({ key: w.id, query: w.query });
      if (Array.isArray(w?.tabs)) {
        w.tabs.forEach((tab: any, i: number) => {
          if (tab?.query?.action) jobs.push({ key: tabDataKey(w.id, i), query: tab.query });
        });
      }
    });

    (onlyKeys ? jobs.filter(job => onlyKeys.has(job.key)) : jobs).forEach(async ({ key, query }) => {
      setLoadingWidgets(prev => ({ ...prev, [key]: true }));
      setWidgetErrors(prev => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        const res = await fetch("/api/dashboard_query.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: query.action,
            params: fetchParamsOf(query)
          })
        });
        const json = await res.json();
        if (json.success) {
          setWidgetData(prev => ({ ...prev, [key]: json.data }));
        } else {
          const msg = json.message || t("The AI-generated query for this widget was rejected.", "AI vygenerovaný dopyt pre tento modul bol zamietnutý.", "A modulhoz generált AI lekérdezést elutasították.");
          console.error(`Failed to fetch data for widget ${key}: ${msg}`);
          setWidgetErrors(prev => ({ ...prev, [key]: msg }));
        }
      } catch (err: any) {
        const msg = err?.message || t("Connection to the server failed.", "Pripojenie na server zlyhalo.", "A szerverkapcsolat sikertelen.");
        console.error(`Failed to fetch data for widget ${key}`, err);
        setWidgetErrors(prev => ({ ...prev, [key]: msg }));
      } finally {
        setLoadingWidgets(prev => ({ ...prev, [key]: false }));
      }
    });
  };

  // Only the queries decide whether data has to be re-fetched. Keying the effect
  // on the whole layout meant every editor action — resizing a card, dragging it
  // one place left, renaming it — re-ran every widget's query.
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const querySignature = useMemo(
    () => JSON.stringify(widgets.map((w: any) => [w?.id, w?.query, w?.tabs?.map((tb: any) => tb?.query)])),
    [widgets]
  );

  // querySignature changing at all does not mean every widget needs refetching —
  // a single card's own "Newest / Highest value" toggle changes that card's query
  // and nothing else, but the whole array's stringified signature still differs.
  // Diff per widget/tab against the last fetch so only the query that actually
  // changed re-fetches (and only that card shows its loading overlay).
  useEffect(() => {
    const widgetsToLoad = widgetsRef.current;
    if (widgetsToLoad.length === 0) return;

    const nextQueries: Record<string, string> = {};
    widgetsToLoad.forEach((w: any) => {
      if (w?.query?.action) nextQueries[w.id] = JSON.stringify(w.query);
      if (Array.isArray(w?.tabs)) {
        w.tabs.forEach((tab: any, i: number) => {
          if (tab?.query?.action) nextQueries[tabDataKey(w.id, i)] = JSON.stringify(tab.query);
        });
      }
    });

    const prevQueries = prevQueriesRef.current;
    const changedKeys = new Set<string>();
    Object.keys(nextQueries).forEach(key => {
      if (prevQueries[key] !== nextQueries[key]) changedKeys.add(key);
    });
    prevQueriesRef.current = nextQueries;

    if (changedKeys.size > 0) {
      fetchAllWidgetsData(widgetsToLoad, changedKeys);
    }
  }, [querySignature]);

  const handleRunPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEdit) return;
    if (!promptText.trim()) return;

    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/generate_dashboard.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText.trim(),
          history: tempPrompts,
          model: selectedModel
        })
      });
      const json = await res.json();
      if (json.success && json.layout) {
        setTempLayout(json.layout);
        setTempPrompts(prev => [...prev, { prompt: promptText.trim(), layout: json.layout }]);
        setPromptText("");
        setIsSaved(false);
      } else {
        setErrorMsg(json.message || t("Failed to generate dashboard layout.", "Vygenerovanie rozloženia nástenky zlyhalo.", "Az irányítópult elrendezésének létrehozása sikertelen."));
      }
    } catch (err: any) {
      setErrorMsg(err.message || t("Connection to AI agent failed.", "Pripojenie k AI agentovi zlyhalo.", "Az AI ügynökhöz való kapcsolódás sikertelen."));
    } finally {
      setIsGenerating(false);
    }
  };

  // Silently backfills en/sk/hu for a panel saved before the multi-language
  // schema existed (or produced by a model that ignored it) so it reads
  // correctly for every viewer without anyone having to ask for it. Runs
  // once per dashboard load and, since it only adds missing translations
  // rather than changing anything a user typed, persists on its own.
  const autoTranslatedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hasLegacyText(dashboard.layout)) return;
    if (autoTranslatedIdsRef.current.has(dashboard.id)) return;
    autoTranslatedIdsRef.current.add(dashboard.id);

    let cancelled = false;
    (async () => {
      setIsTranslating(true);
      try {
        const res = await fetch("/api/translate_dashboard.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: dashboard.layout, model: dashboard.activeModel || "gpt-5.6-terra" })
        });
        const json = await res.json();
        if (!cancelled && json.success && json.layout) {
          const updated: CustomDashboard = { ...dashboard, layout: json.layout };
          onSaveDashboard(updated);
          setTempLayout(json.layout);
        }
      } catch {
        // Non-fatal: the panel just keeps showing in its original language
        // until the next successful attempt (e.g. after reload).
        autoTranslatedIdsRef.current.delete(dashboard.id);
      } finally {
        if (!cancelled) setIsTranslating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [dashboard.id]);

  const handleSave = () => {
    if (!canEdit) return;
    const updated: CustomDashboard = {
      ...dashboard,
      layout: tempLayout,
      prompts: tempPrompts,
      activeModel: selectedModel
    };
    onSaveDashboard(updated);
    setIsSaved(true);
    setIsEditMode(false);
    setSettingsWidgetId(null);
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t("Dashboard saved successfully!", "Panel bol úspešne uložený!", "Irányítópult sikeresen mentve!"));
    }
  };

  /* ---------------------------------------------------------------------
     Manual widget editing. Everything here works on `tempLayout`, exactly
     like an AI generation does, so a hand edit and a prompt refinement are
     both discarded by leaving without saving.
  --------------------------------------------------------------------- */

  const mutateWidgets = (fn: (widgets: any[]) => any[]) => {
    if (!canEdit) return;
    setTempLayout((prev: any) => ({ ...prev, widgets: fn(prev?.widgets || []) }));
    setIsSaved(false);
  };

  /** First row the widget's query returned — what type conversion guesses from. */
  const sampleRowOf = (widgetId: string) => {
    const data = widgetData[widgetId];
    return Array.isArray(data) ? data[0] : data;
  };

  const updateWidget = (id: string, patch: Record<string, any>) =>
    mutateWidgets(ws => ws.map(w => (w.id === id ? { ...w, ...patch } : w)));

  const removeWidget = (id: string) => {
    if (!canDelete) return;
    mutateWidgets(ws => ws.filter(w => w.id !== id));
    if (settingsWidgetId === id) setSettingsWidgetId(null);
  };

  const duplicateWidget = (id: string) =>
    mutateWidgets(ws => {
      const index = ws.findIndex(w => w.id === id);
      if (index === -1) return ws;
      const copy = { ...ws[index], id: newWidgetId("widget") };
      return [...ws.slice(0, index + 1), copy, ...ws.slice(index + 1)];
    });

  /* ---------------------------------------------------------------------
     Arranging the board by hand.

     A card has no coordinates of its own — the grid lays the list out in
     order — so dragging one is really a question of which *index* it should
     take. The pointer answers it two ways: let go over another card and the
     dragged one takes its place; let go over empty cells and it takes the
     index that lands it exactly there. Empty cells are only offered when the
     card actually fits in them, which is why a three-column card can be parked
     in the unused half of the top row and an eight-column one cannot.

     This is a pointer drag rather than an HTML5 one. The native kind cannot
     animate the card under the cursor, and it refuses to drop anywhere that
     did not opt in as a target — which is precisely what empty space is.
  --------------------------------------------------------------------- */

  const gridRef = useRef<HTMLDivElement | null>(null);
  const cardNodes = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<DragSession | null>(null);

  const registerCard = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) cardNodes.current.set(id, node);
    else cardNodes.current.delete(id);
  }, []);

  const gridItemOf = (widget: any): GridItem => ({
    id: widget.id,
    size: sizeOf(widget),
    rowSpan: Number(widget?.rowSpan) === 2 ? 2 : 1
  });

  /**
   * Everything that can move a card: its order, its width, how many rows it
   * claims, and whether one of them is currently in the air. A change to any of
   * these is a layout the cards should glide into rather than jump to.
   */
  const layoutSignature = useMemo(
    () =>
      widgets.map((w: any) => `${w.id}/${sizeOf(w)}/${Number(w?.rowSpan) === 2 ? 2 : 1}`).join("|") +
      `#${draggedWidgetId || ""}`,
    [widgets, draggedWidgetId]
  );

  const { seed: seedFlip } = useGridFlip(gridRef, layoutSignature, isEditMode);

  const beginWidgetDrag = (event: React.PointerEvent, id: string) => {
    if (!isEditMode || !canEdit || event.button !== 0) return;
    const node = cardNodes.current.get(id);
    if (!node) return;

    const rect = node.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();

    dragRef.current = {
      id,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      originX: 0,
      originY: 0,
      zones: [],
      cards: [],
      measured: false,
      dropIndex: null,
      dropCardId: null
    };

    setDropZones([]);
    setActiveZone(null);
    setDragOverWidgetId(null);
    setDraggedWidgetId(id);
  };

  /**
   * With the card lifted out of the flow the board has already closed up behind
   * it, so this is the moment its empty cells are real and can be measured.
   * Positions come from `offsetLeft`/`offsetTop`, which ignore any transform a
   * layout animation still has running.
   */
  useLayoutEffect(() => {
    const session = dragRef.current;
    const grid = gridRef.current;
    if (!draggedWidgetId || !session || !grid || session.measured) return;

    const dragged = widgets.find((w: any) => w.id === draggedWidgetId);
    if (!dragged) return;

    // The card has just been rendered fixed at `x, y`; wherever it actually
    // landed tells us what its coordinates are really measured from.
    const lifted = cardNodes.current.get(draggedWidgetId);
    if (lifted) {
      const box = lifted.getBoundingClientRect();
      session.originX = box.left - session.x;
      session.originY = box.top - session.y;
      lifted.style.transform =
        `translate3d(${session.x - session.originX}px, ${session.y - session.originY}px, 0)`;
    }

    const breakpoint = breakpointForWidth(window.innerWidth);
    const rest = widgets.filter((w: any) => w.id !== draggedWidgetId);
    const restItems = rest.map(gridItemOf);
    const plan = planGrid(restItems, breakpoint);

    const gutter = parseFloat(getComputedStyle(grid).columnGap) || 24;
    const columnWidth = (grid.clientWidth - gutter * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

    // Where each row of the grid starts and ends, read off the cards
    // themselves. A card that owns exactly one row settles that row outright; a
    // card spanning two only gets a say, by even division, where nothing else
    // speaks for the row.
    const settled = new Map<number, { top: number; bottom: number }>();
    const guessed = new Map<number, { top: number; bottom: number }>();
    let heightSum = 0;
    let heightCount = 0;

    for (const placement of plan) {
      const node = cardNodes.current.get(placement.id);
      if (!node) continue;
      const top = node.offsetTop;
      const bottom = top + node.offsetHeight;

      if (placement.rowSpan === 1) {
        const band = settled.get(placement.row);
        settled.set(
          placement.row,
          band ? { top: Math.min(band.top, top), bottom: Math.max(band.bottom, bottom) } : { top, bottom }
        );
        heightSum += node.offsetHeight;
        heightCount++;
      } else {
        const each = (node.offsetHeight - gutter * (placement.rowSpan - 1)) / placement.rowSpan;
        for (let r = 0; r < placement.rowSpan; r++) {
          const rowTop = top + r * (each + gutter);
          if (!guessed.has(placement.row + r)) {
            guessed.set(placement.row + r, { top: rowTop, bottom: rowTop + each });
          }
        }
      }
    }

    const fallbackHeight = heightCount ? heightSum / heightCount : 170;
    const rows = rowCountOf(plan);
    const bands: { top: number; bottom: number }[] = [];
    let cursor = 0;
    // One band past the last row: letting go below everything starts a new one.
    for (let row = 0; row <= rows; row++) {
      const band = settled.get(row) || guessed.get(row) || { top: cursor, bottom: cursor + fallbackHeight };
      bands.push(band);
      cursor = band.bottom + gutter;
    }

    const zones: DropZone[] = freeDropTargets(restItems, gridItemOf(dragged), breakpoint).map(target => {
      const first = bands[target.row] || { top: cursor, bottom: cursor + fallbackHeight };
      const last = bands[target.row + target.rowSpan - 1] || first;
      return {
        insertIndex: target.insertIndex,
        left: target.col * (columnWidth + gutter),
        top: first.top,
        width: target.span * columnWidth + (target.span - 1) * gutter,
        height: Math.max(last.bottom - first.top, 96)
      };
    });

    session.zones = zones;
    session.cards = rest.flatMap((w: any) => {
      const node = cardNodes.current.get(w.id);
      if (!node) return [];
      return [{
        id: w.id,
        left: node.offsetLeft,
        top: node.offsetTop,
        width: node.offsetWidth,
        height: node.offsetHeight
      }];
    });
    session.measured = true;
    setDropZones(zones);
  }, [draggedWidgetId, widgets]);

  // The drag itself: carry the card, work out what is under the pointer, commit.
  useEffect(() => {
    if (!draggedWidgetId) return;

    const grid = gridRef.current;
    const node = cardNodes.current.get(draggedWidgetId) || null;

    const covers = (zone: BoardRect, x: number, y: number) =>
      x >= zone.left && x <= zone.left + zone.width && y >= zone.top && y <= zone.top + zone.height;

    const onMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;

      session.x = event.clientX - session.grabX;
      session.y = event.clientY - session.grabY;
      if (node) {
        node.style.transform =
          `translate3d(${session.x - session.originX}px, ${session.y - session.originY}px, 0)`;
      }
      if (!grid) return;

      const bounds = grid.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      const zone = session.zones.findIndex(candidate => covers(candidate, x, y));
      if (zone !== -1) {
        session.dropIndex = session.zones[zone].insertIndex;
        session.dropCardId = null;
        setActiveZone(zone);
        setDragOverWidgetId(null);
        return;
      }

      const card = session.cards.find(candidate => covers(candidate, x, y));
      session.dropIndex = null;
      session.dropCardId = card ? card.id : null;
      setActiveZone(null);
      setDragOverWidgetId(card ? card.id : null);
    };

    const settle = (commit: boolean) => {
      const session = dragRef.current;
      dragRef.current = null;

      if (session && grid) {
        // Hand the card the place the pointer left it in, so the layout
        // animation carries it from there into its slot instead of snapping.
        const bounds = grid.getBoundingClientRect();
        seedFlip(session.id, {
          x: session.x - bounds.left,
          y: session.y - bounds.top,
          w: session.width,
          h: session.height
        });
      }

      if (session && commit) {
        if (session.dropIndex !== null) {
          const index = session.dropIndex;
          mutateWidgets(ws => insertAt(ws, session.id, index));
        } else if (session.dropCardId && session.dropCardId !== session.id) {
          const targetId = session.dropCardId;
          mutateWidgets(ws => {
            const at = ws.filter(w => w.id !== session.id).findIndex(w => w.id === targetId);
            return at === -1 ? ws : insertAt(ws, session.id, at);
          });
        }
      }

      setDraggedWidgetId(null);
      setDragOverWidgetId(null);
      setActiveZone(null);
      setDropZones([]);
    };

    const onUp = () => settle(true);
    const onCancel = () => settle(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedWidgetId]);

  const changeWidgetType = (id: string, nextType: string) =>
    mutateWidgets(ws => ws.map(w => (w.id === id ? adaptWidgetToType(w, nextType, sampleRowOf(id)) : w)));

  /**
   * Phases a widget can be narrowed to: everything Settings has configured, plus
   * any phase the widget is already reporting or filtering on. The union matters
   * after a phase is renamed or retired in Settings — the old name stays pickable
   * for as long as leads still carry it.
   */
  const statusOptionsFor = (widget: any): string[] => {
    const action = widget?.query?.action;
    if (action === "recent_tasks") return taskStates;
    if (action !== STAGE_QUERY_ACTION && action !== "recent_leads") return [];
    const data = widgetData[widget.id];
    const fromData = Array.isArray(data) ? data.map((row: any) => row?.status) : [];
    const picked = settingsOfWidget(widget).statuses;
    const seen = new Set<string>();
    return [...pipelineStages, ...fromData, ...(Array.isArray(picked) ? picked : [])]
      .map(stage => String(stage ?? "").trim())
      .filter(stage => {
        if (!stage) return false;
        const key = canonical(stage);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  /**
   * Widget titles are `{ en, sk, hu }`. A rename types one language, so the
   * other two are filled with the same text rather than left showing the old
   * title to half the team.
   */
  const renameWidget = (id: string, value: string) =>
    mutateWidgets(ws =>
      ws.map(w => {
        if (w.id !== id) return w;
        // An AI widget keeps the name it arrived with, so it can still be told
        // apart (and restored) after the user renames it.
        const baseTitle = presetOfWidget(w) || w.baseTitle ? w.baseTitle : w.title;
        return { ...w, ...(baseTitle ? { baseTitle } : {}), title: { en: value, sk: value, hu: value } };
      })
    );

  /** A settings change is written to the widget and to the query it drives. */
  const patchWidgetSettings = (id: string, patch: WidgetSettings) => {
    mutateWidgets(ws =>
      ws.map(w =>
        w.id === id
          ? applySettingsToQuery(
              w,
              { ...settingsOfWidget(w), ...(viewOverrides[id] || {}), ...patch },
              currentUserName
            )
          : w
      )
    );
    // A deliberate change supersedes whatever the card's own toggle was showing.
    setViewOverrides(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addWidgets = (toAdd: any[]) => {
    if (toAdd.length === 0) return;
    mutateWidgets(ws => [...ws, ...toAdd]);
  };

  const resetToDefaultWidgets = () => {
    if (!canEdit) return;
    if (!window.confirm(t(
      "Replace the current widgets with the default dashboard?",
      "Nahradiť aktuálne moduly predvolenou nástenkou?",
      "Lecseréli a jelenlegi modulokat az alapértelmezett irányítópultra?"
    ))) return;
    setViewOverrides({});
    mutateWidgets(() => buildDefaultHomeWidgets());
  };

  /**
   * Single-widget generation, on the same endpoint the whole-panel prompt uses.
   * History is deliberately not sent: the model would otherwise continue the
   * conversation and hand back a replacement for the entire dashboard.
   */
  const handleGenerateWidget = async () => {
    if (!canEdit) return;
    const request = widgetPrompt.trim();
    if (!request) return;

    setIsGeneratingWidget(true);
    setWidgetPromptError(null);
    try {
      const res = await fetch("/api/generate_dashboard.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            "Add exactly ONE widget to an existing dashboard. Respond with the standard JSON layout object whose \"widgets\" array holds that single widget and nothing else. " +
            `The widget must show: ${request}`,
          history: [],
          model: selectedModel
        })
      });
      const json = await res.json();
      const generated = json?.layout?.widgets;
      if (json.success && Array.isArray(generated) && generated.length > 0) {
        addWidgets([{ ...generated[0], id: newWidgetId("ai"), baseTitle: generated[0].title }]);
        setWidgetPrompt("");
        setIsAddOpen(false);
      } else {
        setWidgetPromptError(
          json.message || t("Failed to generate the widget.", "Vygenerovanie modulu zlyhalo.", "A modul létrehozása sikertelen.")
        );
      }
    } catch (err: any) {
      setWidgetPromptError(
        err?.message || t("Connection to AI agent failed.", "Pripojenie k AI agentovi zlyhalo.", "Az AI ügynökhöz való kapcsolódás sikertelen.")
      );
    } finally {
      setIsGeneratingWidget(false);
    }
  };

  /* ------------------------------------------------------------------ render */

  const renderContext: WidgetRenderContext = {
    t,
    systemLanguage: (systemLanguage as Language) || "en",
    money,
    leadStates: pipelineStages,
    leadStateColors,
    leadSourceColors,
    taskStates,
    taskStateColors,
    navigate,
    currentUser: currentUserName
  };

  const PRESET_RENDERERS: Record<string, React.FC<any>> = {
    metric: MetricWidget,
    openTasks: OpenTasksWidget,
    leadsTable: LeadsTableWidget,
    tasksTable: TasksTableWidget,
    stageDonut: StageDonutWidget,
    sourceBars: SourceBarsWidget,
    taskStatus: TaskStatusWidget
  };

  /**
   * Renders the body of one widget (or of one tab inside a `tabs` widget).
   * `dataKey` selects which entry of widgetData/widgetErrors belongs to it, and
   * `depth` stops a model-generated `tabs` inside `tabs` from recursing forever.
   */
  const renderWidgetBody = (rawWidget: any, dataKey: string, depth = 0): React.ReactNode => {
    const err = widgetErrors[dataKey];
    if (err) {
      return (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold leading-relaxed">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      );
    }

    const { type, widget } = resolveWidgetType(rawWidget);
    const data = widgetData[dataKey];

    switch (type) {
      case "metric":
        return <DashboardMetric widget={widget} data={data} localizedTitle={displayTitleOf(widget)} money={money} />;
      case "chart":
        return <DashboardChart widget={widget} data={data} localizedTitle={displayTitleOf(widget)} />;
      case "table":
        return (
          <DashboardTable
            widget={widget}
            data={data}
            t={t}
            formatCurrency={money}
            systemLanguage={systemLanguage as Language}
            localize={localize}
          />
        );
      case "timeline":
        return <DashboardTimeline widget={widget} data={data} t={t} systemLanguage={systemLanguage as Language} localize={localize} />;
      case "accordion":
        return <DashboardAccordion widget={widget} data={data} t={t} localize={localize} systemLanguage={systemLanguage as Language} />;
      case "tabs":
        if (depth > 0) {
          // Tabs nested inside tabs have no sane layout and no fetched data.
          return (
            <div className="text-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
              {t("Nested tabs are not supported", "Vnorené záložky nie sú podporované", "Az egymásba ágyazott fülek nem támogatottak")}
            </div>
          );
        }
        return (
          <DashboardTabs
            widget={widget}
            localize={localize}
            t={t}
            isTabLoading={(i: number) => !!loadingWidgets[tabDataKey(widget.id, i)]}
            renderTab={(tab: any, i: number) => renderWidgetBody(tab, tabDataKey(widget.id, i), depth + 1)}
          />
        );
      default:
        return null;
    }
  };

  /** The finished card: a designed one where there is one, the generic chrome otherwise. */
  const renderWidgetCard = (w: any): React.ReactNode => {
    const section = sectionOfWidget(w);
    const title = displayTitleOf(w);
    const renderer = widgetErrors[w.id] ? null : rendererOfWidget(w);
    const Designed = renderer ? PRESET_RENDERERS[renderer] : undefined;

    if (Designed) {
      return (
        <Designed
          widget={w}
          data={widgetData[w.id]}
          title={title}
          section={section}
          ctx={renderContext}
          settings={settingsOfWidget(w)}
          onView={(patch: Record<string, any>) =>
            setViewOverrides(prev => ({ ...prev, [w.id]: { ...(prev[w.id] || {}), ...patch } }))
          }
        />
      );
    }

    const GenericIcon = widgetErrors[w.id]
      ? AlertCircle
      : WIDGET_ICONS[resolveWidgetType(w).type] || FileText;
    return (
      <WidgetCard
        icon={GenericIcon}
        accent={widgetErrors[w.id] ? "#e11d48" : ACCENT_COLORS[w.color] || w.color || section.accent}
        title={title}
      >
        <div className="flex-1 flex flex-col justify-center min-w-0">{renderWidgetBody(w, w.id)}</div>
      </WidgetCard>
    );
  };

  const settingsWidget = widgets.find(w => w.id === settingsWidgetId) || null;
  const presentPresetIds = widgets
    .map(w => presetOfWidget(w)?.id)
    .filter((id): id is string => !!id);

  const headerButton =
    "flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-all cursor-pointer shrink-0";

  return (
    <div ref={rootRef} className="w-full space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
      {/* HEADER — same shape as every other module: title block on the left,
          actions on the right, hairline rule underneath. */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-slate-100 pb-6 pt-1">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            {isHome ? (
              <LayoutDashboard className="h-6 w-6" style={{ color: dashboard.color }} />
            ) : (
              <Sparkles className="h-6 w-6" style={{ color: dashboard.color }} />
            )}
            <h1 className="m-0 text-[26px] font-heading font-bold text-slate-900 tracking-[-0.02em]">
              {isHome ? t("Dashboard", "Nástenka", "Irányítópult") : dashboard.name}
            </h1>
          </div>
          <p className="m-0 text-xs text-slate-500 uppercase font-bold tracking-[0.06em]">
            {isHome
              ? t("Your workspace at a glance", "Váš prehľad na jednom mieste", "A munkaterülete egy pillantásra")
              : t("Custom Dynamic AI Dashboard", "Vlastný dynamický AI panel", "Egyéni dinamikus AI irányítópult")}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {!canEdit && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase tracking-wider">
              <Lock className="h-3.5 w-3.5" />
              {t("Read-only access", "Iba na čítanie", "Csak olvasható")}
            </span>
          )}

          {isTranslating && (
            <span
              title={t(
                "Translating this panel's titles and labels into all app languages…",
                "Prekladám názvy a popisky tohto panela do všetkých jazykov aplikácie…",
                "A panel címeinek és feliratainak fordítása az összes alkalmazásnyelvre…"
              )}
              className="px-3 py-2.5 rounded-xl text-slate-400 flex items-center gap-1.5 shrink-0"
            >
              <Languages className="h-4 w-4 animate-pulse" />
            </span>
          )}

          {isEditMode && isHome && widgets.length > 0 && (
            <button
              type="button"
              onClick={resetToDefaultWidgets}
              className={cn(headerButton, "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50")}
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
              {t("Restore default", "Obnoviť predvolené", "Alapértelmezett")}
            </button>
          )}

          {canEdit && isEditMode && widgets.length > 0 && (
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              style={dashboard.color ? { backgroundColor: dashboard.color, borderColor: dashboard.color } : undefined}
              className={cn(headerButton, "bg-indigo-600 text-white border border-indigo-600 shadow-md shadow-indigo-600/30 hover:opacity-90 transition-opacity")}
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              {t("Add widget", "Pridať modul", "Modul hozzáadása")}
            </button>
          )}

          {canEdit && !isEditMode && widgets.length > 0 && (
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className={cn(headerButton, "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50")}
            >
              <Pencil className="h-4 w-4" strokeWidth={2.25} />
              {t("Edit", "Upraviť", "Szerkesztés")}
            </button>
          )}

          {/* Leaves edit mode without discarding anything: unsaved changes stay
              on screen with the Save button next to it. */}
          {isEditMode && widgets.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsEditMode(false);
                setSettingsWidgetId(null);
              }}
              className={cn(headerButton, "bg-slate-900 text-white border border-slate-900 hover:bg-slate-800")}
            >
              <Check className="h-4 w-4" strokeWidth={2.25} />
              {t("Done", "Hotovo", "Kész")}
            </button>
          )}

          {canEdit && !isSaved && (
            <button
              type="button"
              onClick={handleSave}
              className={cn(headerButton, "bg-emerald-600 text-white border border-emerald-600 shadow-md shadow-emerald-600/30 hover:bg-emerald-700")}
            >
              <Save className="h-4 w-4" strokeWidth={2.25} />
              {t("Save", "Uložiť", "Mentés")}
            </button>
          )}
        </div>
      </div>

      {/* Combined Grouped Status Equation Statistics (Leads + Projects + Remaining Invoicable) */}
      {dashboardEquationGroups.length > 0 && (
        <GroupedStatusValueEquationStats
          groups={dashboardEquationGroups}
          currency={currencyCode}
          language={(systemLanguage as Language) || "sk"}
          storageKey="ccrm_dashboard_equation_stats"
        />
      )}

      <div>
        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-sm animate-in fade-in duration-200">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-left">
              <span className="font-bold">{t("Error", "Chyba", "Hiba")}: </span>
              {errorMsg}
            </div>
          </div>
        )}

        {isEditMode && widgets.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-4 min-h-11 px-4 py-2 rounded-2xl bg-indigo-50 border border-indigo-100">
            <span className="flex items-center gap-2.5 text-[13px] font-semibold text-indigo-900">
              <Info className="h-4 w-4 text-indigo-600 shrink-0" strokeWidth={2.25} />
              {t(
                "Edit mode: drag a card by its handle, resize it from the corner, click it to open its settings.",
                "Režim úprav: moduly presúvajte za úchyt, veľkosť meňte rohom, nastavenia otvoríte kliknutím na modul.",
                "Szerkesztés: fogantyúval húzza, sarokból méretezze, kattintson a beállításokhoz."
              )}
            </span>
            <span className="hidden lg:block text-xs font-bold text-indigo-700 shrink-0">
              {t("12-column grid", "Mriežka 12 stĺpcov", "12 oszlopos rács")}
            </span>
          </div>
        )}

        {widgets.length === 0 ? (
          /* Empty Initial State: Large Center Prompt Input */
          <div className="max-w-2xl mx-auto flex flex-col items-center text-center p-8 mt-12">
            <div className="w-16 h-16 rounded-[24px] bg-indigo-50 flex items-center justify-center mb-6 shadow-inner">
              <Sparkles className="h-8 w-8 text-indigo-600 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-wide">
              {canEdit
                ? t("Generate your Dashboard", "Vytvorte si svoj panel", "Irányítópult létrehozása")
                : t("No widgets yet", "Zatiaľ žiadne moduly", "Még nincsenek modulok")}
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              {canEdit
                ? t(
                    "Type what you want to analyze. The AI agent will fetch live database records, build custom metrics and charts.",
                    "Zadajte, čo chcete analyzovať. AI agent načíta živé databázové záznamy a zostaví metriky a grafy.",
                    "Írja be, mit szeretne elemezni. Az AI lekéri az élő adatbázis rekordokat, és diagramokat készít."
                  )
                : t(
                    "This dashboard has no widgets to show.",
                    "Tento panel zatiaľ nemá žiadne moduly.",
                    "Ennek az irányítópultnak nincsenek moduljai."
                  )}
            </p>

            {canEdit && (
            <>
            {/* Nothing here needs an AI key: a dashboard can also be assembled
                from the ready-made widget library, or reset to the starter set. */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <LayoutGrid className="h-4 w-4 text-indigo-600" />
                <span>{t("Pick from the widget library", "Vybrať z knižnice modulov", "Válasszon a modulkönyvtárból")}</span>
              </button>
              {isHome && (
                <button
                  type="button"
                  onClick={() => mutateWidgets(() => buildDefaultHomeWidgets())}
                  className="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <RotateCcw className="h-4 w-4 text-indigo-600" />
                  <span>{t("Use the default layout", "Použiť predvolené rozloženie", "Alapértelmezett elrendezés")}</span>
                </button>
              )}
            </div>

            <form onSubmit={handleRunPrompt} className="w-full mt-8 bg-white border border-slate-200/80 rounded-[28px] shadow-xl p-5 space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  {t("What would you like to build?", "Čo si prajete vytvoriť?", "Mit szeretne felépíteni?")}
                </label>
                <textarea
                  rows={4}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={t(
                    "e.g., Show a count of total leads, a doughnut chart of lead sources, and a table of the newest 5 tasks...",
                    "napr., Zobrazte celkový počet leadov, koláčový graf zdrojov a tabuľku 5 najnovších úloh...",
                    "pl., Mutassa a lead-ek számát, egy kördiagramot a forrásokról, és a legújabb 5 feladatot..."
                  )}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 transition-all font-semibold resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleRunPrompt();
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-5 pt-2">
                <div className="flex flex-col gap-1.5 items-start w-[190px] shrink-0">
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                      {t("Model Power", "Výkon modelu", "Modell Teljesítmény")}
                    </span>
                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-wider whitespace-nowrap">
                      {modelLevelLabel}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    value={modelLevelIndex}
                    onChange={(e) => handleModelSliderChange(Number(e.target.value))}
                    className="w-full accent-purple-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-[9px] font-medium text-slate-400 tracking-tight normal-case">
                    {selectedModel}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isGenerating || !promptText.trim()}
                  className="flex items-center gap-1.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 cursor-pointer shrink-0"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>{t("Generating...", "Generujem...", "Generálás...")}</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>{t("Generate", "Vytvoriť", "Generálás")}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
            </>
            )}
          </div>
        ) : (
          <div className="relative">
            {/* The twelve columns, shown faintly while arranging so a width
                picked in the drawer has something to line up against. */}
            {isEditMode && (
              <div
                aria-hidden="true"
                className="absolute -top-3 -bottom-3 left-0 right-0 hidden lg:grid grid-cols-12 gap-x-6 pointer-events-none"
              >
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="rounded-xl bg-indigo-600/[0.035]" />
                ))}
              </div>
            )}

            <div ref={gridRef} className="relative grid grid-cols-12 gap-6 items-stretch text-left pb-2">
              {/* Every run of empty cells the card in the air would fit in. The
                  one under the pointer is the one it will drop into. */}
              {dropZones.map((zone, index) => (
                <div
                  key={`${zone.insertIndex}-${zone.left}-${zone.top}`}
                  aria-hidden="true"
                  data-drop-zone={zone.insertIndex}
                  {...(activeZone === index ? { "data-drop-active": "" } : {})}
                  className={cn(
                    "absolute rounded-3xl border-2 border-dashed pointer-events-none z-10",
                    "transition-[background-color,border-color,transform] duration-150",
                    activeZone === index
                      ? "border-indigo-500 bg-indigo-500/10 scale-100"
                      : "border-indigo-300 bg-indigo-500/[0.04] scale-[0.985]"
                  )}
                  style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
                />
              ))}

              {widgets.map((w: any) => {
                const size = sizeOf(w);
                const tall = Number(w?.rowSpan) === 2;
                const session = dragRef.current;
                const isDragging = draggedWidgetId === w.id && session?.id === w.id;
                return (
                  <div
                    key={w.id}
                    ref={node => registerCard(w.id, node)}
                    data-flip={w.id}
                    {...(isDragging ? { "data-flip-skip": "" } : {})}
                    className={cn(
                      "relative min-w-0 flex flex-col",
                      !isEditMode && "animate-in fade-in duration-300",
                      SPAN_CLASS[size],
                      tall && "lg:row-span-2"
                    )}
                    style={
                      isDragging && session
                        ? {
                            position: "fixed",
                            left: 0,
                            top: 0,
                            width: session.width,
                            height: session.height,
                            transform:
                              `translate3d(${session.x - session.originX}px, ${session.y - session.originY}px, 0)`,
                            transition: "none",
                            pointerEvents: "none",
                            zIndex: 60
                          }
                        : undefined
                    }
                  >
                    <div
                      onClick={() => {
                        if (isEditMode) setSettingsWidgetId(w.id);
                      }}
                      className={cn(
                        "relative flex flex-col flex-1 min-h-[150px] rounded-3xl",
                        isEditMode && "outline-2 outline-dashed outline-offset-4 cursor-pointer",
                        isEditMode && dragOverWidgetId === w.id && draggedWidgetId !== w.id
                          ? "outline-indigo-500"
                          : isEditMode && "outline-slate-300",
                        isDragging && "shadow-2xl shadow-indigo-950/20 rotate-[0.6deg] scale-[1.015] outline-indigo-400"
                      )}
                    >
                      {isEditMode && (
                        <WidgetEditToolbar
                          t={t}
                          size={size}
                          canDelete={canDelete}
                          onGrab={(e) => beginWidgetDrag(e, w.id)}
                          onSettings={() => setSettingsWidgetId(w.id)}
                          onDuplicate={() => duplicateWidget(w.id)}
                          onRemove={() => removeWidget(w.id)}
                        />
                      )}

                      {/* Only the first fetch for a widget — with nothing on
                          screen yet — earns the blocking spinner. A refetch
                          that already has data to show (a "Newest / Highest
                          value" toggle, a settings change) leaves the old
                          content up and lets the new content take its place,
                          rather than blank the whole card out from under it. */}
                      {loadingWidgets[w.id] && widgetData[w.id] === undefined && (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-[0.5px] z-30 flex items-center justify-center rounded-3xl">
                          <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
                        </div>
                      )}

                      <div className={cn("flex flex-col flex-1 min-w-0", isEditMode && "pointer-events-none")}>
                        {renderWidgetCard(w)}
                      </div>

                      {isEditMode && (
                        <button
                          type="button"
                          aria-label={t("Change width", "Zmeniť veľkosť", "Méret módosítása")}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateWidget(w.id, { size: nextSize(size) });
                          }}
                          className="absolute -right-3 -bottom-3 w-[26px] h-[26px] rounded-lg bg-white border-[1.5px] border-slate-300 shadow-sm flex items-center justify-center z-20 cursor-pointer hover:border-indigo-400"
                        >
                          <ArrowDownRight className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isEditMode && !draggedWidgetId && (
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="col-span-12 md:col-span-6 lg:col-span-3 min-h-[150px] rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {t("Add widget", "Pridať modul", "Modul hozzáadása")}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* The AI refinement bar, docked at the bottom of the workspace in edit
            mode. Sticky rather than viewport-fixed so it stays inside this
            view's own scroll flow; only the bar itself takes pointer events, so
            its transparent margins do not swallow clicks on the widgets. */}
        {canEdit && isEditMode && widgets.length > 0 && (
          <div className="sticky bottom-6 z-40 mt-6 pointer-events-none animate-in slide-in-from-bottom-6 duration-300">
            <form
              onSubmit={handleRunPrompt}
              className="pointer-events-auto max-w-3xl mx-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-[22px] shadow-2xl pl-[18px] pr-2.5 py-2.5 flex items-center gap-3"
            >
              <Sparkles className="h-[18px] w-[18px] text-purple-600 shrink-0" />
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                aria-label={t("Refine the layout with AI", "Upraviť rozloženie s AI", "Elrendezés módosítása AI-val")}
                placeholder={t(
                  "Refine the layout with AI (e.g. change chart X to Y, add metric Z)…",
                  "Upravte rozloženie s AI (napr. zmeňte graf X na Y, pridajte metriku Z)…",
                  "Módosítsa az elrendezést AI-val (pl. az X diagramot Y-ra)…"
                )}
                className="flex-1 min-w-0 h-10 border-0 outline-none bg-transparent text-[13px] font-semibold text-slate-700"
              />
              <div className="hidden sm:flex flex-col gap-1 items-start w-[130px] shrink-0">
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                    {t("Model", "Model", "Modell")}
                  </span>
                  <span className="text-[8px] font-black text-purple-600 uppercase tracking-wider whitespace-nowrap">
                    {modelLevelLabel}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  value={modelLevelIndex}
                  onChange={(e) => handleModelSliderChange(Number(e.target.value))}
                  className="w-full accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isGenerating || !promptText.trim()}
                aria-label={t("Send", "Odoslať", "Küldés")}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        )}
      </div>

      {canEdit && isAddOpen && (
        <AddWidgetDrawer
          t={t}
          localize={localize}
          presentPresetIds={presentPresetIds}
          onAdd={(preset: WidgetPreset) => addWidgets([buildPresetWidget(preset)])}
          onClose={() => setIsAddOpen(false)}
          prompt={widgetPrompt}
          onPrompt={setWidgetPrompt}
          onGenerate={handleGenerateWidget}
          isGenerating={isGeneratingWidget}
          error={widgetPromptError}
          modelLabel={modelLevelLabel}
          modelIndex={modelLevelIndex}
          onModelIndex={handleModelSliderChange}
        />
      )}

      {canEdit && settingsWidget && (
        <WidgetSettingsDrawer
          widget={settingsWidget}
          preset={presetOfWidget(settingsWidget)}
          section={sectionOfWidget(settingsWidget)}
          title={localize(settingsWidget.title)}
          subtitle={`${typeNameOf(settingsWidget)} · ${widgetTypeLabel(resolveWidgetType(settingsWidget).type, t)}`}
          settings={settingsOfWidget(settingsWidget)}
          columnCatalogue={presetOfWidget(settingsWidget)?.columnCatalogue ?? []}
          statusOptions={statusOptionsFor(settingsWidget)}
          statusColors={settingsWidget.query?.action === "recent_tasks" ? taskStateColors : leadStateColors}
          canDelete={canDelete}
          t={t}
          typeOptions={EDITABLE_WIDGET_TYPES.map((type) => ({ value: type, label: widgetTypeLabel(type, t) }))}
          currentType={resolveWidgetType(settingsWidget).type}
          chartTypes={CHART_TYPES}
          currentChartType={CHART_TYPES.includes(canonical(settingsWidget.chartType)) ? canonical(settingsWidget.chartType) : "bar"}
          onType={(type) => changeWidgetType(settingsWidget.id, type)}
          onChartType={(chartType) => updateWidget(settingsWidget.id, { chartType })}
          onRename={(value) => renameWidget(settingsWidget.id, value)}
          onSize={(size) => updateWidget(settingsWidget.id, { size })}
          onSettings={(patch) => patchWidgetSettings(settingsWidget.id, patch)}
          onDelete={() => removeWidget(settingsWidget.id)}
          onClose={() => setSettingsWidgetId(null)}
        />
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   Widget editor chrome. A floating bar over each card in edit mode, holding
   only what you reach for while arranging a grid — move it, see how wide it is,
   copy it, remove it. Everything else is one click away in the settings drawer.
--------------------------------------------------------------------------- */

const widgetTypeLabel = (type: string, t: Translate) => {
  switch (type) {
    case "metric": return t("Metric", "Metrika", "Mérőszám");
    case "chart": return t("Chart", "Graf", "Diagram");
    case "table": return t("Table", "Tabuľka", "Táblázat");
    case "timeline": return t("Timeline", "Časová os", "Idővonal");
    case "accordion": return t("Accordion", "Rozbaľovací zoznam", "Harmonika");
    case "tabs": return t("Tabs", "Záložky", "Fülek");
    default: return type;
  }
};

const WidgetEditToolbar: React.FC<{
  t: Translate;
  size: WidgetSize;
  canDelete: boolean;
  onGrab: (event: React.PointerEvent) => void;
  onSettings: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}> = ({ t, size, canDelete, onGrab, onSettings, onDuplicate, onRemove }) => {
  const button =
    "w-7 h-7 rounded-lg border-0 bg-transparent flex items-center justify-center p-0 text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer";
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute -top-[18px] right-[18px] z-20 flex items-center gap-0.5 h-[34px] px-[3px] rounded-[11px] bg-white border border-slate-200 shadow-lg"
    >
      <span
        onPointerDown={onGrab}
        style={{ touchAction: "none" }}
        title={t(
          "Drag to move \u2014 free space lights up where it fits",
          "Potiahnutím presuniete \u2014 voľné miesto sa zvýrazní, kde sa zmestí",
          "Húzással mozgatható \u2014 a szabad hely kiemelődik, ahová befér"
        )}
        className={cn(button, "cursor-grab active:cursor-grabbing")}
      >
        <Grip className="h-[15px] w-[15px]" strokeWidth={2.25} />
      </span>
      <span className="w-px h-4 bg-slate-200" />
      <span
        className="px-1.5 text-[11px] font-extrabold tracking-[0.06em] text-slate-600"
        title={t("Widget width", "Šírka modulu", "Modul szélessége")}
      >
        {WIDGET_SIZE_LABELS[size]}
      </span>
      <span className="w-px h-4 bg-slate-200" />
      <button type="button" onClick={stop(onSettings)} aria-label={t("Settings", "Nastavenia", "Beállítások")} className={button}>
        <SlidersHorizontal className="h-[15px] w-[15px]" strokeWidth={2.25} />
      </button>
      <button type="button" onClick={stop(onDuplicate)} aria-label={t("Duplicate", "Duplikovať", "Másolás")} className={button}>
        <Copy className="h-[15px] w-[15px]" strokeWidth={2.25} />
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={stop(onRemove)}
          aria-label={t("Remove widget", "Odstrániť modul", "Modul eltávolítása")}
          className={cn(button, "hover:bg-rose-50 hover:text-rose-600")}
        >
          <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
};

/* Single-value KPI card, for AI-generated widgets and anything without a
   dedicated renderer. */
const DashboardMetric: React.FC<{
  widget: any;
  data: any;
  localizedTitle: string;
  money: (value: number, opts?: Intl.NumberFormatOptions) => string;
}> = ({ widget, data, localizedTitle, money }) => {
  const value = (() => {
    if (widget.metricValue !== undefined && widget.metricValue !== "") {
      return widget.metricValue;
    }
    if (data === undefined || data === null) {
      return "...";
    }
    if (Array.isArray(data)) {
      if (data.length === 0) return "0";
      const firstRow = data[0];
      if (typeof firstRow === "object" && firstRow !== null) {
        const keys = Object.keys(firstRow);
        if (keys.length > 0) {
          // `mapping.dataKey` names the column the card is about. Without it the
          // first column is the only guess available, which is right for a
          // single-figure query and wrong for anything shaped like a breakdown.
          const key = widget.mapping?.dataKey && keys.includes(widget.mapping.dataKey)
            ? widget.mapping.dataKey
            : keys[0];
          const val = firstRow[key];
          const keyLower = key.toLowerCase();
          const titleLower = localizedTitle.toLowerCase();
          const isCurrency =
            keyLower.includes("value") ||
            keyLower.includes("worth") ||
            keyLower.includes("revenue") ||
            keyLower.includes("price") ||
            titleLower.includes("value") ||
            titleLower.includes("worth") ||
            titleLower.includes("revenue");

          if (isCurrency && !isNaN(Number(val))) {
            return money(Number(val));
          }
          if (typeof val === "number") return val.toLocaleString();
          // COUNT(*) arrives from PDO as a string; a count is still a number.
          if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) {
            return Number(val).toLocaleString();
          }
          return String(val);
        }
      }
      return JSON.stringify(data);
    }
    if (typeof data === "object") {
      if (data.count !== undefined) return data.count;
      if (data.value !== undefined) return money(Number(data.value));
      return JSON.stringify(data);
    }
    return String(data);
  })();

  return (
    <div
      className="text-[34px] font-bold text-slate-900 tracking-[-0.02em] leading-[1.05]"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {value}
    </div>
  );
};

/* Widget Chart Element utilizing global Chart.js */
interface DashboardChartProps {
  widget: any;
  data: any;
  localizedTitle?: string;
}

/* A goal/progress gauge is a plain percentage bar, not a Chart.js controller —
   Chart.js core ships no "gauge" type, so this is rendered natively instead of
   being handed to `new Chart(...)`, which used to throw "gauge is not a
   registered controller" and crash the whole dashboard section. */
const GaugeWidget: React.FC<DashboardChartProps> = ({ widget, data }) => {
  const dataList = Array.isArray(data) ? data : data ? [data] : [];
  const row = dataList[0] || {};
  const valueKey = widget.mapping?.dataKey || widget.mapping?.valueKey || "value";
  const targetKey = widget.mapping?.targetKey;

  const value = Number(row[valueKey] ?? 0);
  const target = Number(
    (targetKey ? row[targetKey] : undefined) ?? widget.target ?? row.target ?? 0
  );
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0;

  const barColor = accentFor(widget.color);

  return (
    <div className="w-full flex flex-col justify-center gap-2 py-4">
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-xs font-black text-center" style={{ color: barColor }}>
        {pct}%
      </span>
    </div>
  );
};

const DashboardChart: React.FC<DashboardChartProps> = ({ widget, data, localizedTitle }) => {
  // See FinancialReportView in ClientsView.tsx: canvas colours are literals and
  // have to be rebuilt when the appearance changes.
  const appearance = useAppearance();
  const chart = chartTheme(appearance);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const chartPalettes: Record<string, string[]> = {
    indigo: ["#4f46e5", "#818cf8", "#312e81", "#c7d2fe", "#4338ca"],
    blue: ["#2563eb", "#60a5fa", "#1e3a8a", "#dbeafe", "#1d4ed8"],
    emerald: ["#059669", "#34d399", "#064e3b", "#d1fae5", "#047857"],
    purple: ["#8b5cf6", "#a78bfa", "#4c1d95", "#f3e8ff", "#6d28d9"],
    amber: ["#d97706", "#fbbf24", "#78350f", "#fef3c7", "#b45309"],
    rose: ["#e11d48", "#fb7185", "#881337", "#ffe4e6", "#be123c"],
    cyan: ["#0891b2", "#22d3ee", "#164e63", "#ecfeff", "#0e7490"],
    pink: ["#db2777", "#f472b6", "#831843", "#fce7f3", "#be185d"]
  };

  // "horizontalBar" and "area" are not Chart.js controllers — they are a bar with
  // a swapped index axis and a filled line. Normalising here (rather than passing
  // the AI's word straight to `new Chart`) is what makes them actually render.
  const kind = canonical(widget.chartType) || "bar";

  useEffect(() => {
    if (kind === "gauge") return;
    if (!canvasRef.current || !data) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ChartGlob = (window as any).Chart;
    if (!ChartGlob) {
      console.warn("Chart.js is not loaded in the window environment.");
      return;
    }

    const dataList = Array.isArray(data) ? data : [];
    const labelsKey = widget.mapping?.labelsKey || "status";
    const dataKey = widget.mapping?.dataKey || "count";

    const labels = dataList.map((item: any) => item[labelsKey] ?? "Unknown");
    const chartData = dataList.map((item: any) => Number(item[dataKey] || 0));

    const colorKey = widget.color || "indigo";
    const palette = chartPalettes[colorKey] || chartPalettes.indigo;

    const isPie = ["pie", "doughnut", "polararea"].includes(kind);
    const isRadar = kind === "radar";
    const isScatter = kind === "scatter" || kind === "bubble";
    const isHorizontal = kind === "horizontalbar";
    const isArea = kind === "area";

    // Scatter/bubble take {x, y} points instead of labels + values.
    const xKey = widget.mapping?.xKey || widget.mapping?.labelsKey || "x";
    const yKey = widget.mapping?.yKey || widget.mapping?.dataKey || "y";
    const rKey = widget.mapping?.radiusKey || widget.mapping?.sizeKey;
    const scatterData = dataList.map((item: any) => ({
      x: Number(item[xKey] ?? 0),
      y: Number(item[yKey] ?? 0),
      ...(kind === "bubble" ? { r: Math.max(3, Number(item[rKey ?? ""] ?? 6)) } : {})
    }));

    // Chart.js controller ids are case-sensitive ("polarArea"), and neither
    // "horizontalBar" nor "area" is one — they are a bar with a swapped index
    // axis and a filled line. Anything unmapped is passed through so an
    // AI-invented type still surfaces as this widget's error, not a wrong chart.
    const baseType = CHART_BASE_TYPES[kind] || kind;

    const backgroundColor = isPie
      ? palette
      : isScatter
        ? palette[0]
        : isRadar
          ? palette[0] + "33"
          : palette[0] + "20"; // 20% opacity for bar/line
    const borderColor = isPie ? "#ffffff" : palette[0];

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const cartesianScales = {
      x: {
        // Scatter needs a numeric x axis; every other type keeps Chart.js's own
        // default for its controller (category for bar/line).
        ...(isScatter ? { type: "linear" } : {}),
        grid: { display: isScatter || isHorizontal, color: chart.grid },
        ticks: { color: chart.tick, font: { size: 9, weight: "bold" } }
      },
      y: {
        grid: { display: isHorizontal ? false : true, color: chart.grid },
        ticks: { color: chart.tick, font: { size: 9, weight: "bold" } }
      }
    };

    const radarScales = {
      r: {
        grid: { color: chart.grid },
        angleLines: { color: chart.grid },
        pointLabels: { font: { size: 9, weight: "bold" }, color: chart.tick },
        ticks: { font: { size: 8 }, backdropColor: "transparent" }
      }
    };

    try {
      chartInstanceRef.current = new ChartGlob(ctx, {
        type: baseType,
        data: {
          labels: labels,
          datasets: [
            {
              label: localizedTitle ?? widget.title,
              data: isScatter ? scatterData : chartData,
              backgroundColor,
              borderColor,
              borderWidth: isPie ? 2 : isScatter ? 0 : 3,
              fill: isArea || kind === "line" || isRadar,
              tension: 0.3,
              ...(isScatter ? { pointRadius: 5, pointHoverRadius: 7 } : {}),
              ...(isRadar ? { pointBackgroundColor: palette[0], pointRadius: 3 } : {})
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          // Chart.js v3+ dropped the "horizontalBar" type: a horizontal bar is a
          // normal bar chart whose index axis is y.
          ...(isHorizontal ? { indexAxis: "y" } : {}),
          plugins: {
            legend: {
              display: isPie,
              position: "bottom",
              labels: {
                boxWidth: 10,
                color: chart.label,
                font: { size: 9, weight: "bold" }
              }
            }
          },
          scales: isPie ? undefined : isRadar ? radarScales : cartesianScales
        }
      });
      setRenderError(null);
    } catch (err: any) {
      // A chart type Chart.js core doesn't ship a controller for (an AI-picked
      // value outside the documented enum) used to throw here and take the
      // whole dashboard section down. Contain it to this one widget instead.
      setRenderError(err?.message || "Unsupported chart type.");
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [widget, data, appearance, localizedTitle, kind]);

  if (kind === "gauge") {
    return <GaugeWidget widget={widget} data={data} />;
  }

  if (renderError) {
    return (
      <div className="h-[220px] w-full flex items-center justify-center text-center px-4">
        <span className="text-xs font-semibold text-rose-600">{renderError}</span>
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full relative">
      <canvas ref={canvasRef} />
    </div>
  );
};

/* Widget Table Renderer */
interface DashboardTableProps {
  widget: any;
  data: any;
  t: Translate;
  formatCurrency?: (value: number) => string;
  systemLanguage: Language;
  localize: (value: any) => string;
}

const DashboardTable: React.FC<DashboardTableProps> = ({ widget, data, t, formatCurrency = (v) => `€${v.toLocaleString()}`, systemLanguage, localize }) => {
  const dataList = Array.isArray(data) ? data : [];
  const columns = widget.columns || [];

  const formatCell = (val: any, format: string) => {
    if (val === null || val === undefined) return "-";
    if (format === "currency") {
      return formatCurrency(Number(val));
    }
    if (format === "date") {
      return new Date(val).toLocaleDateString(localeCodeFor(systemLanguage));
    }
    return String(val);
  };

  return (
    <div className="w-full overflow-x-auto">
      {dataList.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
          {t("No records found", "Žiadne záznamy", "Nincs találat")}
        </div>
      ) : (
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              {columns.map((c: any, index: number) => (
                <th key={index} className="py-2.5 px-3">
                  {localize(c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-semibold text-slate-700">
            {dataList.map((row: any, rIdx: number) => (
              <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors">
                {columns.map((c: any, cIdx: number) => (
                  <td key={cIdx} className="py-2.5 px-3 whitespace-nowrap">
                    {formatCell(row[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   Layout widgets: timeline, accordion and tabs. These read plain query rows and
   arrange them, so no charting library is involved.
--------------------------------------------------------------------------- */

const EmptyRows: React.FC<{ t: Translate }> = ({ t }) => (
  <div className="text-center py-6 text-xs text-slate-400 font-semibold uppercase tracking-wider">
    {t("No records found", "Žiadne záznamy", "Nincs találat")}
  </div>
);

const TITLE_KEY_CANDIDATES = ["title", "name", "subject", "event", "label", "status"];
const DATE_KEY_CANDIDATES = ["date", "timestamp", "created_at", "received_at", "deadline", "due_date", "start_date"];
const BODY_KEY_CANDIDATES = ["description", "content", "notes", "summary", "body", "detail"];

const formatTimestamp = (val: any, lang: Language) => {
  if (val === null || val === undefined || val === "") return "";
  const parsed = new Date(val);
  if (isNaN(parsed.getTime())) return String(val);
  return parsed.toLocaleDateString(localeCodeFor(lang), { year: "numeric", month: "short", day: "numeric" });
};

/* Chronological event list — meeting history, task activity, audit logs. */
const DashboardTimeline: React.FC<{
  widget: any;
  data: any;
  t: Translate;
  systemLanguage: Language;
  localize: (value: any) => string;
}> = ({ widget, data, t, systemLanguage }) => {
  const dataList = Array.isArray(data) ? data : [];
  if (dataList.length === 0) return <EmptyRows t={t} />;

  const sample = dataList[0];
  const titleKey = pickKey(sample, widget.mapping?.titleKey, TITLE_KEY_CANDIDATES);
  const dateKey = pickKey(sample, widget.mapping?.dateKey, DATE_KEY_CANDIDATES);
  const bodyKey = pickKey(
    sample,
    widget.mapping?.descriptionKey || widget.mapping?.contentKey,
    BODY_KEY_CANDIDATES
  );
  const accent = accentFor(widget.color);

  return (
    <ol className="w-full relative pl-5 py-1 space-y-4">
      <span className="absolute left-[4px] top-2 bottom-2 w-px bg-slate-200" aria-hidden="true" />
      {dataList.map((row: any, i: number) => (
        <li key={i} className="relative">
          <span
            className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white"
            style={{ backgroundColor: i === 0 ? accent : "#cbd5e1" }}
            aria-hidden="true"
          />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-bold text-slate-800">
              {titleKey ? String(row[titleKey] ?? "-") : "-"}
            </span>
            {dateKey && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                {formatTimestamp(row[dateKey], systemLanguage)}
              </span>
            )}
          </div>
          {bodyKey && row[bodyKey] ? (
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-3">
              {String(row[bodyKey])}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
};

/* Collapsible rows — long-form values (notes, summaries) that would blow out a table. */
const DashboardAccordion: React.FC<{
  widget: any;
  data: any;
  t: Translate;
  localize: (value: any) => string;
  systemLanguage: Language;
}> = ({ widget, data, t, systemLanguage }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const dataList = Array.isArray(data) ? data : [];
  if (dataList.length === 0) return <EmptyRows t={t} />;

  const sample = dataList[0];
  const titleKey = pickKey(sample, widget.mapping?.titleKey, TITLE_KEY_CANDIDATES);
  const contentKey = pickKey(
    sample,
    widget.mapping?.contentKey || widget.mapping?.descriptionKey,
    BODY_KEY_CANDIDATES
  );
  const subtitleKey = pickKey(sample, widget.mapping?.subtitleKey, DATE_KEY_CANDIDATES);

  return (
    <div className="w-full divide-y divide-slate-100">
      {dataList.map((row: any, i: number) => {
        const isOpen = openIndex === i;
        const content = contentKey ? row[contentKey] : null;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left cursor-pointer group"
            >
              <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                {titleKey ? String(row[titleKey] ?? "-") : "-"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {subtitleKey && row[subtitleKey] ? (
                  <span className="text-[10px] font-bold text-slate-400">{formatTimestamp(row[subtitleKey], systemLanguage)}</span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </div>
            </button>
            {isOpen && (
              <p className="pb-3 text-[11px] text-slate-500 leading-relaxed whitespace-pre-line animate-in fade-in slide-in-from-top-1 duration-200">
                {content ? String(content) : t("No details.", "Žiadne detaily.", "Nincsenek részletek.")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* Tabbed container — several datasets sharing one card. Each tab carries its own
   query and its own inner widget spec, rendered by the parent's dispatcher. */
const DashboardTabs: React.FC<{
  widget: any;
  localize: (value: any) => string;
  t: Translate;
  isTabLoading: (index: number) => boolean;
  renderTab: (tab: any, index: number) => React.ReactNode;
}> = ({ widget, localize, t, isTabLoading, renderTab }) => {
  const [active, setActive] = useState(0);
  const tabs: any[] = Array.isArray(widget.tabs) ? widget.tabs : [];
  if (tabs.length === 0) return <EmptyRows t={t} />;

  const current = Math.min(active, tabs.length - 1);
  const accent = accentFor(widget.color);
  const activeTab = tabs[current];

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {tabs.map((tab: any, i: number) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
              i === current
                ? "text-white border-transparent shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
            )}
            style={i === current ? { backgroundColor: accent } : undefined}
          >
            {localize(tab?.label ?? tab?.title) || `${t("Tab", "Záložka", "Fül")} ${i + 1}`}
          </button>
        ))}
      </div>

      <div className="relative min-h-[80px] flex flex-col justify-center">
        {isTabLoading(current) ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-4 w-4 text-indigo-600 animate-spin" />
          </div>
        ) : (
          // The tab's own label doubles as its title, so a metric tab keeps the
          // currency heuristic that reads the widget title.
          renderTab({ ...activeTab, title: activeTab?.title ?? activeTab?.label }, current)
        )}
      </div>
    </div>
  );
};
