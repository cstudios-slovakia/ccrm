import { deepenForWhite, liftAccent } from "./accentColor.ts";
import { SECTION_PALETTE, type SectionVisualId } from "./sectionPalette.ts";
import { sectionVisualIdFor } from "./dashboardSection.ts";

/**
 * Canonical Entity Accent Resolver & CSS Variable Generator.
 *
 * Keeps every entity's color consistent whether rendered as the active view
 * (buttons, tabs, row highlights, focus rings, switches, KPI accents) or
 * referenced as a badge/link inside another entity's view.
 */

export type EntityAlias =
  | "lead"
  | "client"
  | "project"
  | "task"
  | "ticket"
  | "order"
  | "invoice"
  | "offer"
  | "product"
  | "employee"
  | "agency_worker"
  | "meeting"
  | "file"
  | "user"
  | "salaries"
  | "vacations"
  | "ai"
  | "time_tracking"
  | "settings"
  | "personal-settings"
  | "unified_entry";

export type EntityAccentId = SectionVisualId | EntityAlias;

export const ENTITY_ALIAS_TO_SECTION: Record<EntityAlias, SectionVisualId> = {
  lead: "leads",
  client: "clients",
  project: "projects",
  task: "tasks",
  ticket: "tickets",
  order: "orders",
  invoice: "invoices",
  offer: "invoices",
  product: "warehouse",
  employee: "employees",
  agency_worker: "agency",
  meeting: "meetings",
  file: "files",
  user: "employees",
  salaries: "employees",
  vacations: "employees",
  ai: "rag_ai",
  time_tracking: "time-tracking",
  settings: "dashboard",
  "personal-settings": "dashboard",
  unified_entry: "projects",
};

const SETTINGS_DEFAULT_HEX = "#475569";
const PERSONAL_SETTINGS_HEX = "#4f46e5";
const DEFAULT_ACCENT_HEX = SECTION_PALETTE.dashboard.color;

const isHexColor = (value: string | undefined | null): value is string =>
  typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value.trim());

/** Resolve a section ID, singular entity alias, or route base segment to a SectionVisualId. */
export function resolveSectionId(entityOrRoute: string | undefined | null): SectionVisualId | null {
  if (!entityOrRoute) return null;
  const clean = entityOrRoute.trim().replace(/^#/, "").toLowerCase();
  const base = clean.split(/[/?#]/)[0];

  if (base in SECTION_PALETTE) {
    return base as SectionVisualId;
  }
  if (base in ENTITY_ALIAS_TO_SECTION) {
    return ENTITY_ALIAS_TO_SECTION[base as EntityAlias];
  }
  if (base.startsWith("lead-")) return "leads";
  if (base.startsWith("client-")) return "clients";
  if (base.startsWith("project-")) return "projects";
  if (base.startsWith("ticket-")) return "tickets";
  if (base.startsWith("employee-")) return "employees";
  if (base.startsWith("order-")) return "orders";
  if (base.startsWith("user-")) return "employees";
  if (base.startsWith("agency")) return "agency";
  if (base.startsWith("time-tracking")) return "time-tracking";
  if (base.startsWith("newsletter")) return "newsletter";
  return null;
}

/** Resolve any entity identifier or route string to its canonical hex color. */
export function resolveEntityHex(entityOrRoute: string | undefined | null, customColor?: string): string {
  if (isHexColor(customColor)) {
    return customColor.trim();
  }
  const clean = (entityOrRoute || "").trim().replace(/^#/, "").toLowerCase();
  const base = clean.split(/[/?#]/)[0];
  if (base === "settings") return SETTINGS_DEFAULT_HEX;
  if (base === "personal-settings") return PERSONAL_SETTINGS_HEX;

  const sectionId = resolveSectionId(base);
  if (sectionId) {
    return SECTION_PALETTE[sectionId].color;
  }
  return DEFAULT_ACCENT_HEX;
}

/** Resolve active app route (including custom dashboards & unified entries) to a canonical hex color. */
export function resolveRouteEntityHex(
  activeRoute: string | undefined | null,
  customDashboards: Array<{ id: string; color?: string }> = [],
  unifiedEntries: Array<{ id: string; color?: string }> = []
): string {
  const clean = (activeRoute || "dashboard").trim().replace(/^#/, "").toLowerCase();
  const base = clean.split(/[/?#]/)[0];

  if (base.startsWith("dash_")) {
    const dashId = base.slice("dash_".length);
    const dash = customDashboards.find((d) => d.id.toLowerCase() === dashId);
    if (isHexColor(dash?.color)) return dash.color.trim();
    return SECTION_PALETTE.dashboard.color;
  }

  if (base.startsWith("ue_")) {
    const ueId = base.slice("ue_".length);
    const ue = unifiedEntries.find((entry) => entry.id.toLowerCase() === ueId);
    if (isHexColor(ue?.color)) return ue.color.trim();
    return SECTION_PALETTE.projects.color;
  }

  // The Dashboard section is drawn as Overview while the Performance Dashboard holds it.
  return resolveEntityHex(sectionVisualIdFor(base));
}

/** Generate CSS custom properties for an entity accent hex color (Light + Dark mode safe). */
export function entityAccentVars(hex: string): Record<string, string> {
  const base = isHexColor(hex) ? hex.trim() : DEFAULT_ACCENT_HEX;
  const solid = deepenForWhite(base, 4.5);
  return {
    "--entity-accent": base,
    "--entity-accent-solid": solid,
    "--entity-accent-solid-hover": `color-mix(in oklab, ${solid} 86%, black)`,
    "--entity-accent-text": liftAccent(base),
    "--entity-accent-subtle": `color-mix(in oklab, ${base} 10%, transparent)`,
    "--entity-accent-muted": `color-mix(in oklab, ${base} 16%, transparent)`,
    "--entity-accent-border": `color-mix(in oklab, ${base} 28%, transparent)`,
    "--entity-accent-ring": `color-mix(in oklab, ${base} 25%, transparent)`,
  };
}

/** Convenience helper returning CSS custom properties for either an entity ID or hex color. */
export function entityAccentStyle(entityOrHex: string | undefined | null, customColor?: string): Record<string, string> {
  const hex = isHexColor(entityOrHex) ? entityOrHex.trim() : resolveEntityHex(entityOrHex, customColor);
  return entityAccentVars(hex);
}
