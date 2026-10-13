// Which modules a dashboard widget reads, so a role is never shown a tile it cannot fill.
//
// The server decides what a query may return (api/dashboard_query.php). This mirrors its rules
// only to hide a widget the caller would see refused or empty: a new custom role starts with the
// dashboard open, and without this its home screen would be a wall of errors and zeroes.

export interface SourceAccess {
  can: (key: string) => boolean;
  isAdmin: boolean;
}

/** Any-of groups: the widget is visible when EVERY group has at least one key the caller can view. */
type Groups = string[][];

const ADMIN_ONLY = "__admin__";

const PRESET_GROUPS: Record<string, Groups> = {
  leads_count: [["leads", "clients"]],
  leads_by_status: [["leads", "clients"]],
  leads_by_source: [["leads", "clients"]],
  pipeline_value: [["leads", "clients"]],
  recent_leads: [["leads", "clients"]],
  tasks_summary: [["tasks"]],
  tasks_by_owner: [["tasks"]],
  recent_tasks: [["tasks"]],
  recent_meetings: [["meetings"]],
};

/** table (or prefix) -> requirement groups, as in dashboard_query.php's ccrm_dashboard_sql_requirements(). */
const TABLE_GROUPS: [RegExp, Groups][] = [
  [/\blead_categories\b|\bleads\b/, [["leads"], ["clients"]]],
  [/\btimeline_events\b/, [["leads"], ["clients"], ["email"]]],
  [/\btask_assignees\b|\btasks\b/, [["tasks"], ["tasks.view_all"]]],
  [/\brole_permissions\b|\broles\b/, [["pm_managers"]]],
  [/\bmeeting_notes\b|\bmeeting_tasks\b/, [["meetings"]]],
  [/\bemail_summaries\b|\brag_emails\b/, [[ADMIN_ONLY]]],
  [/\bunified_entries\b|\bue_[a-z0-9_]+\b/, [["unified_entries"]]],
  [/\bcustom_dashboards\b/, [["dashboard.custom"]]],
  [/\berror_logs\b/, [[ADMIN_ONLY]]],
  [/\bproject_types\b|\bprojects\b|\bproject_managers\b|\bproj_(?:data|timeline|gantt)_[a-z0-9_]+\b/, [["projects"]]],
];

/** The requirement groups of one query ({action, params}). Unknown actions need nothing here (the server refuses them). */
export const queryRequirements = (query: any): Groups => {
  if (!query || typeof query !== "object") return [];
  const action = String(query.action ?? "");
  if (action === "sql") {
    const sql = String(query.params?.sql ?? query.sql ?? "").toLowerCase();
    const groups: Groups = [];
    for (const [pattern, g] of TABLE_GROUPS) {
      if (pattern.test(sql)) groups.push(...g);
    }
    return groups;
  }
  return PRESET_GROUPS[action] ?? [];
};

/** Every query a widget runs: its own, plus one per tab. */
export const widgetQueries = (widget: any): any[] => {
  const queries: any[] = [];
  if (widget?.query) queries.push(widget.query);
  if (Array.isArray(widget?.tabs)) {
    for (const tab of widget.tabs) if (tab?.query) queries.push(tab.query);
  }
  return queries;
};

/** May the caller see this widget? Admin sees everything; otherwise every query's requirements must hold. */
export const canViewWidget = (widget: any, access: SourceAccess | undefined): boolean => {
  if (!access || access.isAdmin) return true;
  for (const query of widgetQueries(widget)) {
    for (const group of queryRequirements(query)) {
      if (!group.some((key) => key !== ADMIN_ONLY && access.can(key))) return false;
    }
  }
  return true;
};
