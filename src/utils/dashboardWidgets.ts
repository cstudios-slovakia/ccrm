/**
 * The Dashboard section (`#dashboard`) and every custom AI panel share one
 * widget format — the JSON `generate_dashboard.php` emits. This module holds the
 * hand-written half of it: the starter layout the Dashboard ships with, and the
 * library of ready-made widgets that can be dropped in without asking the AI.
 *
 * Every preset queries `/api/dashboard_query.php`. The named actions
 * (`leads_count`, `pipeline_value`, …) are preferred over raw `sql` because they
 * are fixed server-side statements — no key, no model and no SQL guard involved,
 * so a fresh install renders a populated dashboard before anything is
 * configured. The handful of presets that do use `sql` stay inside what
 * `is_safe_select_query()` allows: a single read-only SELECT over CRM tables.
 *
 * A preset also carries the things the *designed* dashboard needs and an
 * AI-generated card does not: which app section it belongs to (its icon and
 * accent come from there, so a card never invents a colour of its own), which
 * dedicated renderer draws it, and the settings its drawer offers.
 */

import {
  BarChart3,
  CalendarClock,
  ChartColumnIncreasing,
  ChartNoAxesColumn,
  ChartPie,
  CircleDollarSign,
  Clock,
  Layers,
  ListChecks,
  ListTodo,
  PencilLine,
  TableProperties,
  Target,
  TrendingUp,
  Users
} from "lucide-react";
import type { CustomDashboard } from "../types";

/** Reserved id of the built-in Dashboard panel inside `customDashboards`. */
export const HOME_DASHBOARD_ID = "__home__";

/**
 * True for the built-in Dashboard, which is stored alongside the user-created
 * AI panels but must never be listed as one (it has its own nav item).
 * Ids created in the sidebar are stripped of leading non-letters, so a
 * user-made panel can never collide with this one.
 */
export const isHomeDashboard = (id: string) => id === HOME_DASHBOARD_ID;

export type WidgetSize = "sm" | "md" | "lg" | "full";

export const WIDGET_SIZES: WidgetSize[] = ["sm", "md", "lg", "full"];

/**
 * How many of the twelve columns each size takes. `lg` is two thirds rather
 * than a half: the dashboard's two big tables sit beside a stacked pair of
 * quarter-width cards, which only lines up on an 8 + 4 split.
 */
export const WIDGET_SIZE_SPAN: Record<WidgetSize, number> = {
  sm: 3,
  md: 4,
  lg: 8,
  full: 12
};

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  sm: "S",
  md: "M",
  lg: "L",
  full: "XL"
};

export interface LocalizedText {
  en: string;
  sk: string;
  hu: string;
}

const text = (en: string, sk: string, hu: string): LocalizedText => ({ en, sk, hu });

/* ---------------------------------------------------------------------------
   Sections. A widget belongs to the part of the app its data comes from, and
   borrows that section's icon and accent — the same ones the sidebar paints —
   so the dashboard reads as a summary of the app rather than as a palette.
--------------------------------------------------------------------------- */

export type WidgetSectionId = "leads" | "tasks" | "meetings";

export interface WidgetSection {
  id: WidgetSectionId;
  title: LocalizedText;
  /** Solid accent: icon chips, donut fallbacks, the section header in the library. */
  accent: string;
  icon: any;
  /** Where "See all" goes. */
  route: string;
}

export const WIDGET_SECTIONS: Record<WidgetSectionId, WidgetSection> = {
  leads: {
    id: "leads",
    title: text("Sales board", "Obchodná nástenka", "Értékesítési tábla"),
    accent: "#2563eb",
    icon: TableProperties,
    route: "leads"
  },
  tasks: {
    id: "tasks",
    title: text("Task board", "Panel úloh", "Feladattábla"),
    accent: "#ff5d00",
    icon: ListTodo,
    route: "tasks"
  },
  meetings: {
    id: "meetings",
    title: text("Meeting room", "Zasadačka", "Tárgyaló"),
    accent: "#4f46e5",
    icon: PencilLine,
    route: "meetings"
  }
};

/* ---------------------------------------------------------------------------
   Columns the two designed tables can show. `locked` columns are the identity
   of the row — the lead, the task — and cannot be switched off, because a row
   without them is a row you cannot click on with any idea of what it is.
--------------------------------------------------------------------------- */

export interface WidgetColumnDef {
  key: string;
  label: LocalizedText;
  hint?: LocalizedText;
  locked?: boolean;
}

export const LEAD_TABLE_COLUMNS: WidgetColumnDef[] = [
  {
    key: "lead",
    label: text("Lead", "Lead", "Lead"),
    hint: text("Name, type and town", "Názov, typ a mesto", "Név, típus és város"),
    locked: true
  },
  { key: "status", label: text("Stage", "Fáza", "Fázis") },
  { key: "value", label: text("Value", "Hodnota", "Érték") },
  { key: "owner", label: text("Manager", "Manažér", "Menedzser") },
  { key: "source", label: text("Source", "Zdroj", "Forrás") },
  { key: "category", label: text("Category", "Kategória", "Kategória") },
  { key: "created_at", label: text("Created", "Vytvorené", "Létrehozva") }
];

export const TASK_TABLE_COLUMNS: WidgetColumnDef[] = [
  {
    key: "task",
    label: text("Task", "Úloha", "Feladat"),
    hint: text("Title and the lead it belongs to", "Názov a súvisiaci lead", "Cím és a kapcsolódó lead"),
    locked: true
  },
  { key: "owner", label: text("Assignee", "Riešiteľ", "Felelős") },
  { key: "status", label: text("Status", "Stav", "Állapot") },
  {
    key: "deadline",
    label: text("Deadline", "Termín", "Határidő"),
    hint: text("Turns red once it is overdue", "Po termíne sa zafarbí na červeno", "Lejárat után pirosra vált")
  },
  { key: "priority", label: text("Priority", "Priorita", "Prioritás") },
  { key: "project", label: text("Project", "Projekt", "Projekt") }
];

/** The rows-per-table choices the settings drawer offers. */
export const WIDGET_ROW_COUNTS = [5, 10, 15];

/* ------------------------------------------------------------------------ */

/**
 * Which dedicated renderer draws a preset. Anything without one (and every
 * AI-generated widget) falls back to the generic metric / chart / table
 * renderers, which read the same rows.
 */
export type WidgetRenderer =
  | "metric"
  | "openTasks"
  | "leadsTable"
  | "tasksTable"
  | "stageDonut"
  | "sourceBars"
  | "taskStatus";

/** Label shown next to a library entry — what kind of card it is. */
export type WidgetKind = "metric" | "chart" | "table" | "timeline";

export interface WidgetSettings {
  /** Lead tables: "recent" | "value". Task tables: "created" | "deadline". */
  order?: string;
  rows?: number;
  /** Task tables: whose tasks — "mine" or "team". */
  scope?: "mine" | "team";
  /** Lead phases / task states the card reports. Empty = whatever exists. */
  statuses?: string[];
  /** Visible column keys, in the order they are drawn. */
  columns?: string[];
}

export interface WidgetPreset {
  /** Stable preset id; the widget instance gets a unique suffix when added. */
  id: string;
  section: WidgetSectionId;
  kind: WidgetKind;
  /** Icon shown in the library list (the card itself uses the section icon). */
  icon: any;
  title: LocalizedText;
  description: LocalizedText;
  /** Which table of columns its settings drawer offers, if any. */
  columnCatalogue?: WidgetColumnDef[];
  build: () => Record<string, any>;
}

const sqlQuery = (sql: string) => ({ action: "sql", params: { sql, bind: [] } });

const PRESETS: WidgetPreset[] = [
  {
    id: "total_leads",
    section: "leads",
    kind: "metric",
    icon: TableProperties,
    title: text("Total leads", "Celkovo leadov", "Összes lead"),
    description: text(
      "Every lead in the register.",
      "Všetky leady v registri.",
      "Az összes rögzített lead."
    ),
    build: () => ({
      type: "metric",
      renderer: "metric",
      title: text("Total leads", "Celkovo leadov", "Összes lead"),
      size: "sm",
      query: { action: "leads_count", params: {} }
    })
  },
  {
    id: "leads_this_month",
    section: "leads",
    kind: "metric",
    icon: CalendarClock,
    title: text("Leads this month", "Leady tento mesiac", "Leadek ebben a hónapban"),
    description: text(
      "Created since the first of the month.",
      "Vytvorené od prvého dňa mesiaca.",
      "A hónap elseje óta létrehozva."
    ),
    build: () => ({
      type: "metric",
      renderer: "metric",
      title: text("Leads this month", "Leady tento mesiac", "Leadek ebben a hónapban"),
      size: "sm",
      query: sqlQuery(
        "SELECT COUNT(*) AS count FROM leads WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"
      )
    })
  },
  {
    id: "pipeline_value",
    section: "leads",
    kind: "metric",
    icon: CircleDollarSign,
    title: text("Pipeline value", "Hodnota pipeline", "Pipeline érték"),
    description: text(
      "Summed worth of every open opportunity.",
      "Súčet hodnoty všetkých príležitostí.",
      "Az összes lehetőség összértéke."
    ),
    build: () => ({
      type: "metric",
      renderer: "metric",
      title: text("Pipeline value", "Hodnota pipeline", "Pipeline érték"),
      size: "sm",
      query: { action: "pipeline_value", params: {} }
    })
  },
  {
    id: "leads_by_status",
    section: "leads",
    kind: "chart",
    icon: ChartPie,
    title: text("Leads by stage", "Leady podľa fázy", "Leadek fázis szerint"),
    description: text(
      "How the pipeline is distributed.",
      "Ako je rozložený pipeline.",
      "Hogyan oszlik meg a pipeline."
    ),
    build: () => ({
      type: "chart",
      chartType: "doughnut",
      renderer: "stageDonut",
      title: text("Leads by stage", "Leady podľa fázy", "Leadek fázis szerint"),
      size: "md",
      mapping: { labelsKey: "status", dataKey: "count" },
      query: { action: "leads_by_status", params: {} }
    })
  },
  {
    id: "leads_by_source",
    section: "leads",
    kind: "chart",
    icon: ChartNoAxesColumn,
    title: text("Leads by source", "Leady podľa zdroja", "Leadek forrás szerint"),
    description: text(
      "Which channels bring the work in.",
      "Ktoré kanály prinášajú prácu.",
      "Mely csatornák hozzák a munkát."
    ),
    build: () => ({
      type: "chart",
      chartType: "horizontalBar",
      renderer: "sourceBars",
      title: text("Leads by source", "Leady podľa zdroja", "Leadek forrás szerint"),
      size: "md",
      mapping: { labelsKey: "source", dataKey: "count" },
      query: { action: "leads_by_source", params: {} }
    })
  },
  {
    id: "value_by_owner",
    section: "leads",
    kind: "chart",
    icon: BarChart3,
    title: text("Value per manager", "Hodnota podľa manažéra", "Érték menedzserenként"),
    description: text(
      "Opportunity worth held by each project manager.",
      "Hodnota príležitostí u jednotlivých manažérov.",
      "Az egyes menedzserekhez tartozó lehetőségek értéke."
    ),
    build: () => ({
      type: "chart",
      chartType: "horizontalBar",
      title: text("Value per manager", "Hodnota podľa manažéra", "Érték menedzserenként"),
      size: "md",
      color: "emerald",
      mapping: { labelsKey: "owner", dataKey: "total" },
      query: sqlQuery(
        "SELECT owner, SUM(value) AS total FROM leads WHERE owner IS NOT NULL AND owner <> '' GROUP BY owner ORDER BY total DESC"
      )
    })
  },
  {
    id: "leads_over_time",
    section: "leads",
    kind: "chart",
    icon: TrendingUp,
    title: text("Leads over time", "Leady v čase", "Leadek időben"),
    description: text(
      "New leads per month over the last year.",
      "Nové leady po mesiacoch za posledný rok.",
      "Új leadek havonta az elmúlt évben."
    ),
    build: () => ({
      type: "chart",
      chartType: "area",
      title: text("Leads over time", "Leady v čase", "Leadek időben"),
      size: "lg",
      color: "indigo",
      mapping: { labelsKey: "month", dataKey: "count" },
      query: sqlQuery(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count FROM leads WHERE created_at IS NOT NULL GROUP BY month ORDER BY month ASC LIMIT 12"
      )
    })
  },
  {
    id: "recent_leads",
    section: "leads",
    kind: "table",
    icon: Layers,
    title: text("Newest leads", "Najnovšie leady", "Legújabb leadek"),
    description: text(
      "Name, stage, value and manager.",
      "Názov, fáza, hodnota a manažér.",
      "Név, fázis, érték és menedzser."
    ),
    columnCatalogue: LEAD_TABLE_COLUMNS,
    build: () => ({
      type: "table",
      renderer: "leadsTable",
      title: text("Newest leads", "Najnovšie leady", "Legújabb leadek"),
      size: "lg",
      rowSpan: 2,
      settings: { order: "recent", rows: 5, statuses: [], columns: ["lead", "status", "value", "owner"] },
      query: { action: "recent_leads", params: { limit: 5, order: "recent" } }
    })
  },
  {
    id: "open_tasks",
    section: "tasks",
    kind: "metric",
    icon: Target,
    title: text("Open tasks", "Otvorené úlohy", "Nyitott feladatok"),
    description: text(
      "Everything not yet finished.",
      "Všetko, čo ešte nie je hotové.",
      "Minden, ami még nincs kész."
    ),
    build: () => ({
      type: "metric",
      renderer: "openTasks",
      title: text("Open tasks", "Otvorené úlohy", "Nyitott feladatok"),
      size: "sm",
      query: { action: "tasks_summary", params: {} }
    })
  },
  {
    id: "tasks_by_status",
    section: "tasks",
    kind: "chart",
    icon: ChartColumnIncreasing,
    title: text("Tasks by status", "Úlohy podľa stavu", "Feladatok állapot szerint"),
    description: text(
      "Where the team's work currently sits.",
      "Kde sa práca tímu práve nachádza.",
      "Hol tart a csapat munkája."
    ),
    build: () => ({
      type: "chart",
      chartType: "bar",
      renderer: "taskStatus",
      title: text("Tasks by status", "Úlohy podľa stavu", "Feladatok állapot szerint"),
      size: "md",
      mapping: { labelsKey: "status", dataKey: "count" },
      query: { action: "tasks_summary", params: {} }
    })
  },
  {
    id: "tasks_by_owner",
    section: "tasks",
    kind: "chart",
    icon: Users,
    title: text("Tasks per person", "Úlohy podľa osoby", "Feladatok személyenként"),
    description: text(
      "Workload split across the team.",
      "Rozdelenie práce v tíme.",
      "A munkateher megoszlása a csapatban."
    ),
    build: () => ({
      type: "chart",
      chartType: "bar",
      title: text("Tasks per person", "Úlohy podľa osoby", "Feladatok személyenként"),
      size: "md",
      color: "blue",
      mapping: { labelsKey: "owner", dataKey: "count" },
      query: { action: "tasks_by_owner", params: {} }
    })
  },
  {
    id: "recent_tasks",
    section: "tasks",
    kind: "table",
    icon: ListChecks,
    title: text("Newest tasks", "Najnovšie úlohy", "Legújabb feladatok"),
    description: text(
      "Assignee, status and deadline.",
      "Riešiteľ, stav a termín.",
      "Felelős, állapot és határidő."
    ),
    columnCatalogue: TASK_TABLE_COLUMNS,
    build: () => ({
      type: "table",
      renderer: "tasksTable",
      title: text("Newest tasks", "Najnovšie úlohy", "Legújabb feladatok"),
      size: "lg",
      settings: {
        order: "created",
        rows: 5,
        scope: "team",
        statuses: [],
        columns: ["task", "owner", "status", "deadline"]
      },
      query: { action: "recent_tasks", params: { limit: 5, order: "created" } }
    })
  },
  {
    id: "upcoming_deadlines",
    section: "tasks",
    kind: "table",
    icon: Clock,
    title: text("Upcoming deadlines", "Blížiace sa termíny", "Közelgő határidők"),
    description: text(
      "Unfinished tasks due next, soonest first.",
      "Nedokončené úlohy s najbližším termínom.",
      "A legközelebbi határidejű befejezetlen feladatok."
    ),
    build: () => ({
      type: "table",
      title: text("Upcoming deadlines", "Blížiace sa termíny", "Közelgő határidők"),
      size: "lg",
      color: "rose",
      columns: [
        { key: "title", label: text("Task", "Úloha", "Feladat"), format: "text" },
        { key: "owner", label: text("Owner", "Riešiteľ", "Felelős"), format: "text" },
        { key: "deadline", label: text("Deadline", "Termín", "Határidő"), format: "date" }
      ],
      query: sqlQuery(
        "SELECT title, owner, deadline FROM tasks WHERE status <> 'done' AND deadline IS NOT NULL ORDER BY deadline ASC LIMIT 6"
      )
    })
  },
  {
    id: "recent_meetings",
    section: "meetings",
    kind: "timeline",
    icon: PencilLine,
    title: text("Recent meetings", "Posledné stretnutia", "Legutóbbi találkozók"),
    description: text(
      "Latest entries from the meeting room.",
      "Najnovšie záznamy zo zasadačky.",
      "A legfrissebb bejegyzések a tárgyalóból."
    ),
    build: () => ({
      type: "timeline",
      title: text("Recent meetings", "Posledné stretnutia", "Legutóbbi találkozók"),
      size: "md",
      color: "indigo",
      mapping: { titleKey: "title", dateKey: "created_at" },
      query: { action: "recent_meetings", params: { limit: 6 } }
    })
  }
];

export const WIDGET_PRESETS = PRESETS;

/** The library's groups, in the order the drawer lists them. */
export const WIDGET_SECTION_ORDER: WidgetSectionId[] = ["leads", "tasks", "meetings"];

/** Fresh, collision-proof id for a widget added to a live layout. */
export const newWidgetId = (base: string) =>
  `${base}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Instantiates a preset as a widget ready to be appended to a layout. */
export const buildPresetWidget = (preset: WidgetPreset): Record<string, any> => ({
  id: newWidgetId(preset.id),
  presetId: preset.id,
  ...preset.build()
});

/**
 * The library preset a widget was made from, or null for an AI-generated one.
 * The title is free to rename, so the editor needs this to keep telling the
 * user what a card actually is. Widgets saved before `presetId` existed are
 * recognised by their id prefix, and copies (which got a generic id) by the
 * query they run — every named action and every SQL statement is unique to
 * one preset.
 */
export const presetOfWidget = (widget: any): WidgetPreset | null => {
  if (!widget) return null;
  const byId = (id: string) => PRESETS.find((p) => p.id === id) || null;
  if (typeof widget.presetId === "string") return byId(widget.presetId);

  const rawId = String(widget.id ?? "").replace(/^default_/, "");
  const byPrefix = PRESETS.find((p) => rawId === p.id || rawId.startsWith(`${p.id}_`));
  if (byPrefix) return byPrefix;

  const action = widget.query?.action;
  if (!action) return null;
  return (
    PRESETS.find((p) => {
      const query = p.build().query;
      if (query?.action !== action) return false;
      return action !== "sql" || query.params?.sql === widget.query?.params?.sql;
    }) || null
  );
};

/** The section a widget draws its icon and accent from. Leads is the fallback. */
export const sectionOfWidget = (widget: any): WidgetSection =>
  WIDGET_SECTIONS[presetOfWidget(widget)?.section ?? "leads"];

/**
 * The dedicated renderer for a widget, or null when the generic ones should
 * draw it. Read off the widget so a layout saved with an older preset table
 * still renders, and off the preset so a widget saved before renderers existed
 * picks one up.
 */
export const rendererOfWidget = (widget: any): WidgetRenderer | null => {
  const explicit = widget?.renderer;
  if (typeof explicit === "string") return explicit as WidgetRenderer;
  const preset = presetOfWidget(widget);
  const built = preset?.build();
  return (built?.renderer as WidgetRenderer) ?? null;
};

/** A widget's settings, with the preset's defaults filled in for what is missing. */
export const settingsOfWidget = (widget: any): WidgetSettings => {
  const defaults = (presetOfWidget(widget)?.build()?.settings ?? {}) as WidgetSettings;
  return { ...defaults, ...(widget?.settings ?? {}) };
};

/**
 * Rewrites a widget's query from its settings.
 *
 * Settings and query params are deliberately kept in step rather than merged:
 * the fetch effect watches `query`, so a filter that only lived in `settings`
 * would change the card's chrome without ever re-running its statement.
 */
export const applySettingsToQuery = (widget: any, settings: WidgetSettings, currentUser?: string): any => {
  const action = widget?.query?.action;

  // The phase breakdown takes the same `statuses` filter, and nothing else the
  // drawer offers: its rows *are* the phases.
  if (action === "leads_by_status") {
    return {
      ...widget,
      settings,
      query: {
        ...(widget.query || {}),
        params: { ...(widget.query?.params || {}), statuses: settings.statuses ?? [] }
      }
    };
  }

  if (action !== "recent_leads" && action !== "recent_tasks") {
    return { ...widget, settings };
  }

  const params: Record<string, any> = {
    ...(widget.query?.params || {}),
    limit: settings.rows ?? 5,
    order: settings.order ?? (action === "recent_leads" ? "recent" : "created"),
    statuses: settings.statuses ?? []
  };

  if (action === "recent_tasks") {
    if (settings.scope === "mine" && currentUser) {
      params.owner = currentUser;
    } else {
      delete params.owner;
    }
  }

  return { ...widget, settings, query: { ...(widget.query || {}), params } };
};

/** The columns a table widget draws, in order, with locked ones guaranteed. */
export const visibleColumnsOf = (widget: any): string[] => {
  const preset = presetOfWidget(widget);
  const catalogue = preset?.columnCatalogue;
  if (!catalogue) return [];
  const settings = settingsOfWidget(widget);
  const picked = Array.isArray(settings.columns) ? settings.columns : [];
  const known = picked.filter((key) => catalogue.some((c) => c.key === key));
  const locked = catalogue.filter((c) => c.locked).map((c) => c.key);
  const missingLocked = locked.filter((key) => !known.includes(key));
  return [...missingLocked, ...known];
};

/**
 * The widgets a Dashboard that has never been edited shows.
 *
 * The order is the layout: four quarter-width figures, then the lead table
 * beside the two pipeline breakdowns stacked against it, then the task table
 * beside the task breakdown. `rowSpan` on the lead table is what lets the two
 * cards next to it stack instead of pushing the next row down.
 */
const DEFAULT_PRESET_IDS = [
  "total_leads",
  "leads_this_month",
  "pipeline_value",
  "open_tasks",
  "recent_leads",
  "leads_by_status",
  "leads_by_source",
  "recent_tasks",
  "tasks_by_status"
];

export const buildDefaultHomeWidgets = (): Record<string, any>[] =>
  DEFAULT_PRESET_IDS.map((id) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    // Deterministic ids: the starter layout is rebuilt on every render until the
    // user saves, and a fresh random id each time would remount every widget and
    // re-fire its query on each pass.
    return { id: `default_${preset.id}`, presetId: preset.id, ...preset.build() };
  });

/** The Dashboard panel used until the user saves one of their own. */
export const buildDefaultHomeDashboard = (): CustomDashboard => ({
  id: HOME_DASHBOARD_ID,
  name: "Dashboard",
  icon: "LayoutDashboard",
  color: "#4f46e5",
  prompts: [],
  layout: { widgets: buildDefaultHomeWidgets() },
  activeModel: "gpt-5.6-terra",
  archived: false
});
