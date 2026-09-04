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
 */

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

export interface LocalizedText {
  en: string;
  sk: string;
  hu: string;
}

export interface WidgetPreset {
  /** Stable preset id; the widget instance gets a unique suffix when added. */
  id: string;
  group: "leads" | "tasks" | "activity";
  title: LocalizedText;
  description: LocalizedText;
  build: () => Record<string, any>;
}

const text = (en: string, sk: string, hu: string): LocalizedText => ({ en, sk, hu });

const sqlQuery = (sql: string) => ({ action: "sql", params: { sql, bind: [] } });

const PRESETS: WidgetPreset[] = [
  {
    id: "total_leads",
    group: "leads",
    title: text("Total leads", "Celkovo leadov", "Összes lead"),
    description: text(
      "Every lead in the register.",
      "Všetky leady v registri.",
      "Az összes rögzített lead."
    ),
    build: () => ({
      type: "metric",
      title: text("Total leads", "Celkovo leadov", "Összes lead"),
      size: "sm",
      color: "indigo",
      query: { action: "leads_count", params: {} }
    })
  },
  {
    id: "leads_this_month",
    group: "leads",
    title: text("Leads this month", "Leady tento mesiac", "Leadek ebben a hónapban"),
    description: text(
      "Leads created since the first of the month.",
      "Leady vytvorené od prvého dňa mesiaca.",
      "A hónap elseje óta létrehozott leadek."
    ),
    build: () => ({
      type: "metric",
      title: text("Leads this month", "Leady tento mesiac", "Leadek ebben a hónapban"),
      size: "sm",
      color: "blue",
      query: sqlQuery(
        "SELECT COUNT(*) AS count FROM leads WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"
      )
    })
  },
  {
    id: "pipeline_value",
    group: "leads",
    title: text("Pipeline value", "Hodnota pipeline", "Pipeline érték"),
    description: text(
      "Summed worth of every open opportunity.",
      "Súčet hodnoty všetkých príležitostí.",
      "Az összes lehetőség összértéke."
    ),
    build: () => ({
      type: "metric",
      title: text("Pipeline value", "Hodnota pipeline", "Pipeline érték"),
      size: "sm",
      color: "emerald",
      query: { action: "pipeline_value", params: {} }
    })
  },
  {
    id: "open_tasks",
    group: "tasks",
    title: text("Open tasks", "Otvorené úlohy", "Nyitott feladatok"),
    description: text(
      "Everything not yet finished.",
      "Všetko, čo ešte nie je hotové.",
      "Minden, ami még nincs kész."
    ),
    build: () => ({
      type: "metric",
      title: text("Open tasks", "Otvorené úlohy", "Nyitott feladatok"),
      size: "sm",
      color: "amber",
      query: sqlQuery("SELECT COUNT(*) AS count FROM tasks WHERE status <> 'done'")
    })
  },
  {
    id: "leads_by_status",
    group: "leads",
    title: text("Leads by stage", "Leady podľa fázy", "Leadek fázis szerint"),
    description: text(
      "How the pipeline is distributed.",
      "Ako je rozložený pipeline.",
      "Hogyan oszlik meg a pipeline."
    ),
    build: () => ({
      type: "chart",
      chartType: "doughnut",
      title: text("Leads by stage", "Leady podľa fázy", "Leadek fázis szerint"),
      size: "md",
      color: "indigo",
      mapping: { labelsKey: "status", dataKey: "count" },
      query: { action: "leads_by_status", params: {} }
    })
  },
  {
    id: "leads_by_source",
    group: "leads",
    title: text("Leads by source", "Leady podľa zdroja", "Leadek forrás szerint"),
    description: text(
      "Which channels bring the work in.",
      "Ktoré kanály prinášajú prácu.",
      "Mely csatornák hozzák a munkát."
    ),
    build: () => ({
      type: "chart",
      chartType: "horizontalBar",
      title: text("Leads by source", "Leady podľa zdroja", "Leadek forrás szerint"),
      size: "md",
      color: "cyan",
      mapping: { labelsKey: "source", dataKey: "count" },
      query: { action: "leads_by_source", params: {} }
    })
  },
  {
    id: "value_by_owner",
    group: "leads",
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
    id: "tasks_by_status",
    group: "tasks",
    title: text("Tasks by status", "Úlohy podľa stavu", "Feladatok állapot szerint"),
    description: text(
      "Where the team's work currently sits.",
      "Kde sa práca tímu práve nachádza.",
      "Hol tart a csapat munkája."
    ),
    build: () => ({
      type: "chart",
      chartType: "bar",
      title: text("Tasks by status", "Úlohy podľa stavu", "Feladatok állapot szerint"),
      size: "md",
      color: "purple",
      mapping: { labelsKey: "status", dataKey: "count" },
      query: { action: "tasks_summary", params: {} }
    })
  },
  {
    id: "tasks_by_owner",
    group: "tasks",
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
    id: "recent_leads",
    group: "leads",
    title: text("Newest leads", "Najnovšie leady", "Legújabb leadek"),
    description: text(
      "The last five leads that arrived.",
      "Posledných päť prijatých leadov.",
      "A legutóbbi öt beérkezett lead."
    ),
    build: () => ({
      type: "table",
      title: text("Newest leads", "Najnovšie leady", "Legújabb leadek"),
      size: "lg",
      color: "blue",
      columns: [
        { key: "name", label: text("Name", "Názov", "Név"), format: "text" },
        { key: "status", label: text("Stage", "Fáza", "Fázis"), format: "text" },
        { key: "value", label: text("Value", "Hodnota", "Érték"), format: "currency" },
        { key: "created_at", label: text("Created", "Vytvorené", "Létrehozva"), format: "date" }
      ],
      query: { action: "recent_leads", params: { limit: 5 } }
    })
  },
  {
    id: "recent_tasks",
    group: "tasks",
    title: text("Newest tasks", "Najnovšie úlohy", "Legújabb feladatok"),
    description: text(
      "The last five tasks that were created.",
      "Posledných päť vytvorených úloh.",
      "A legutóbbi öt létrehozott feladat."
    ),
    build: () => ({
      type: "table",
      title: text("Newest tasks", "Najnovšie úlohy", "Legújabb feladatok"),
      size: "lg",
      color: "amber",
      columns: [
        { key: "title", label: text("Task", "Úloha", "Feladat"), format: "text" },
        { key: "owner", label: text("Owner", "Riešiteľ", "Felelős"), format: "text" },
        { key: "status", label: text("Status", "Stav", "Állapot"), format: "text" },
        { key: "deadline", label: text("Deadline", "Termín", "Határidő"), format: "date" }
      ],
      query: { action: "recent_tasks", params: { limit: 5 } }
    })
  },
  {
    id: "upcoming_deadlines",
    group: "tasks",
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
    group: "activity",
    title: text("Recent meetings", "Posledné stretnutia", "Legutóbbi találkozók"),
    description: text(
      "Latest entries from the meeting room.",
      "Najnovšie záznamy zo stretnutí.",
      "A legfrissebb találkozó-bejegyzések."
    ),
    build: () => ({
      type: "timeline",
      title: text("Recent meetings", "Posledné stretnutia", "Legutóbbi találkozók"),
      size: "md",
      color: "pink",
      mapping: { titleKey: "title", dateKey: "created_at" },
      query: { action: "recent_meetings", params: { limit: 6 } }
    })
  },
  {
    id: "leads_over_time",
    group: "activity",
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
  }
];

export const WIDGET_PRESETS = PRESETS;

/** Fresh, collision-proof id for a widget added to a live layout. */
export const newWidgetId = (base: string) =>
  `${base}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Instantiates a preset as a widget ready to be appended to a layout. */
export const buildPresetWidget = (preset: WidgetPreset): Record<string, any> => ({
  id: newWidgetId(preset.id),
  ...preset.build()
});

/** The widgets a Dashboard that has never been edited shows. */
const DEFAULT_PRESET_IDS = [
  "total_leads",
  "leads_this_month",
  "pipeline_value",
  "open_tasks",
  "leads_by_status",
  "leads_by_source",
  "tasks_by_status",
  "recent_leads",
  "recent_tasks"
];

export const buildDefaultHomeWidgets = (): Record<string, any>[] =>
  DEFAULT_PRESET_IDS.map((id) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    // Deterministic ids: the starter layout is rebuilt on every render until the
    // user saves, and a fresh random id each time would remount every widget and
    // re-fire its query on each pass.
    return { id: `default_${preset.id}`, ...preset.build() };
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
