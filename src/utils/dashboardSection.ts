/**
 * Which screen the Dashboard section (`#dashboard`) shows.
 *
 * - `false` (current): the Performance Dashboard (`components/Dashboard.tsx`), which used to be the
 *   separate "Analytics" section at `#overview`. It takes the Dashboard's place everywhere: the same
 *   menu slot (saved navigation layouts and role layouts keep working because the id stays
 *   `dashboard`), the start menu, Visible modules, default pages and the landing route. `#overview`
 *   becomes an alias of `#dashboard`, and the Analytics entry is hidden. Access follows the
 *   `overview` permission, so a role that could not see these company metrics still cannot.
 * - `true`: the legacy widget board (`DynamicDashboardView` showing the `__home__` row of
 *   `customDashboards`) is back at `#dashboard` and Analytics is its own section again.
 *
 * Reverting is this one line. The widget board's code is untouched, and its saved layout (the
 * `__home__` custom dashboard of each company) is never read for display, rewritten or deleted
 * while this is `false`: it stays in the database exactly as it was and comes back as it was.
 */
export const LEGACY_WIDGET_DASHBOARD: boolean = false;

/** Route ids that exist only while the legacy widget board is active (hidden from every menu otherwise). */
export const isRetiredSectionId = (id: string): boolean => !LEGACY_WIDGET_DASHBOARD && id === "overview";

/** Hash aliases that send old Analytics links to the Dashboard section. */
export const DASHBOARD_SECTION_ALIASES: Record<string, string> = LEGACY_WIDGET_DASHBOARD ? {} : { overview: "dashboard" };

/**
 * The Dashboard section's name and look. While the Performance Dashboard holds it, the section is
 * "Overview" with the original Analytics icon and colour; the page inside keeps its own title
 * ("Performance Dashboard") and tabs.
 */
export const DASHBOARD_SECTION_LABEL_KEY = LEGACY_WIDGET_DASHBOARD ? "sidebar.dashboard" : "sidebar.overview";

/** The section-visual id (icon and colours) a route id is drawn with. */
export const sectionVisualIdFor = (id: string): string =>
  !LEGACY_WIDGET_DASHBOARD && id === "dashboard" ? "overview" : id;
