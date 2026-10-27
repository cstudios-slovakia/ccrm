import {
  Building2, Users, LayoutGrid, TableProperties, Briefcase, ClipboardList, Coins,
  LifeBuoy, Mail, Plug, Server, IdCard, Landmark, Network, Languages, UserRound,
  ShieldCheck, ScrollText, ToggleRight, Shapes, Workflow, Signpost, Tags, Shuffle,
  Webhook, CircleDot, Sparkles, ListChecks, ListTodo, Percent, BadgePercent, CreditCard,
  LayoutTemplate, BadgeCheck, PackageCheck, Truck, BookOpen, FolderTree, Inbox, Send,
  MailCheck, Key, Bot, Megaphone, Share2, KeyRound, Database, Bug, TriangleAlert, FileText, Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ONE list of every settings category and section.
//
// The tiles, the sidebar navigation, the section tabs / dropdown, the search
// index, the "fall back to a permitted category" effect and the table of old
// `#settings/<id>` links all read this file. While the old SETTINGS_TABS and the
// permission effect each kept their own copy, standing on a tab missing from the
// shorter copy bounced the user back to the first tab every time a background
// sync produced a new `roles` array — add a section here and nowhere else.
//
// Everything a person reads is a translation key (settings.nav.* — see
// utils/translations.settingsNav.ts), written in en, sk and hu.

export type SettingsGroupId = "organization" | "work" | "connections";

export type SettingsTintId =
  | "indigo" | "blue" | "violet" | "emerald" | "sky" | "amber"
  | "orange" | "teal" | "pink" | "cyan" | "fuchsia" | "slate" | "purple" | "rose";

/** The `-50` background and `-600` foreground of a category's palette ramp. */
export const SETTINGS_TINTS: Record<SettingsTintId, { bg: string; fg: string }> = {
  indigo: { bg: "bg-indigo-50", fg: "text-indigo-600" },
  blue: { bg: "bg-blue-50", fg: "text-blue-600" },
  violet: { bg: "bg-violet-50", fg: "text-violet-600" },
  emerald: { bg: "bg-emerald-50", fg: "text-emerald-600" },
  sky: { bg: "bg-sky-50", fg: "text-sky-600" },
  amber: { bg: "bg-amber-50", fg: "text-amber-600" },
  orange: { bg: "bg-orange-50", fg: "text-orange-600" },
  teal: { bg: "bg-teal-50", fg: "text-teal-600" },
  pink: { bg: "bg-pink-50", fg: "text-pink-600" },
  cyan: { bg: "bg-cyan-50", fg: "text-cyan-600" },
  fuchsia: { bg: "bg-fuchsia-50", fg: "text-fuchsia-600" },
  slate: { bg: "bg-slate-100", fg: "text-slate-600" },
  purple: { bg: "bg-purple-50", fg: "text-purple-600" },
  rose: { bg: "bg-rose-50", fg: "text-rose-600" },
};

/** Feature gates a section can sit behind; resolved by `SettingsFlags`. */
export type SettingsFlag = "social" | "projectAutoCreate";

export interface SettingsSectionDef {
  /** Unique inside its category; the third segment of `settings/<category>/<section>`. */
  id: string;
  icon: LucideIcon;
  /** The permission the old tab used. The section shows while it is not "nothing". */
  permKey: string;
  /** The server answers administrators only (audit log, shared mailboxes). */
  adminOnly?: boolean;
  flag?: SettingsFlag;
  /** The section is a card that links into another module's own settings screen. */
  linkOnly?: boolean;
}

export interface SettingsRelatedDef {
  /** `category/section` the link opens. Hidden when the user cannot see it. */
  to: string;
  /** Translation key of the link's own wording ("Who may edit stages"). */
  labelKey: string;
}

export interface SettingsCategoryDef {
  id: string;
  group: SettingsGroupId;
  icon: LucideIcon;
  tint: SettingsTintId;
  sections: SettingsSectionDef[];
  related: SettingsRelatedDef[];
}

export interface SettingsGroupDef {
  id: SettingsGroupId;
  categories: SettingsCategoryDef[];
}

const S = (
  id: string,
  icon: LucideIcon,
  permKey: string,
  extra: Partial<Omit<SettingsSectionDef, "id" | "icon" | "permKey">> = {},
): SettingsSectionDef => ({ id, icon, permKey, ...extra });

const rel = (to: string, n: string): SettingsRelatedDef => ({ to, labelKey: `settings.nav.rel.${n}` });

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  // ── Organization ──────────────────────────────────────────────────────────
  {
    id: "company", group: "organization", icon: Building2, tint: "indigo",
    sections: [
      S("profile", IdCard, "general_config"),
      S("billing", FileText, "general_config"),
      S("bank", Landmark, "general_config"),
      S("divisions", Network, "traffic_sources"),
      S("regional", Languages, "general_config"),
    ],
    related: [rel("offers/defaults", "vat_terms"), rel("offers/payments", "payment_methods"), rel("access/roles", "who_edits_company")],
  },
  {
    id: "access", group: "organization", icon: Users, tint: "blue",
    sections: [
      S("users", UserRound, "pm_managers"),
      S("roles", ShieldCheck, "pm_managers"),
      S("audit", ScrollText, "general_config", { adminOnly: true }),
    ],
    related: [rel("modules/visible", "what_people_see"), rel("leads/assignment", "who_gets_leads")],
  },
  {
    id: "modules", group: "organization", icon: LayoutGrid, tint: "violet",
    sections: [
      S("visible", ToggleRight, "general_config"),
      S("records", Shapes, "general_config"),
    ],
    related: [rel("access/roles", "who_uses_modules"), rel("company/profile", "company_profile")],
  },
  // ── Work & sales ──────────────────────────────────────────────────────────
  {
    id: "leads", group: "work", icon: TableProperties, tint: "teal",
    sections: [
      S("stages", Workflow, "pipeline_stages"),
      S("sources", Signpost, "traffic_sources"),
      S("interests", Tags, "traffic_sources"),
      S("assignment", Shuffle, "pipeline_stages"),
      S("intake", Webhook, "general_config"),
    ],
    related: [rel("projects/autocreate", "projects_from_leads"), rel("integrations/api", "web_form_key"), rel("access/roles", "who_edits_stages")],
  },
  {
    id: "projects", group: "work", icon: Briefcase, tint: "purple",
    sections: [
      S("types", Shapes, "general_config"),
      S("statuses", CircleDot, "general_config"),
      S("autocreate", Sparkles, "general_config", { flag: "projectAutoCreate" }),
      S("tasks", ListChecks, "general_config"),
      S("time", Timer, "general_config"),
      S("taskstates", ListTodo, "traffic_sources"),
    ],
    related: [rel("leads/stages", "lead_stages"), rel("leads/interests", "interest_categories"), rel("access/roles", "who_edits_projects")],
  },
  {
    id: "offers", group: "work", icon: FileText, tint: "emerald",
    sections: [
      S("defaults", Percent, "general_config"),
      S("prices", BadgePercent, "general_config"),
      S("payments", CreditCard, "general_config"),
      S("templates", LayoutTemplate, "invoices", { linkOnly: true }),
      S("offerstatuses", BadgeCheck, "invoices", { linkOnly: true }),
    ],
    related: [rel("company/billing", "billing_details"), rel("company/bank", "bank_account"), rel("finance/ledger", "ledger_mode")],
  },
  {
    id: "orders", group: "work", icon: ClipboardList, tint: "blue",
    sections: [
      S("statuses", PackageCheck, "general_config"),
      S("shipping", Truck, "general_config"),
    ],
    related: [rel("offers/payments", "payment_methods"), rel("offers/prices", "price_levels")],
  },
  {
    id: "finance", group: "work", icon: Coins, tint: "emerald",
    sections: [
      S("ledger", BookOpen, "financial"),
      S("categories", FolderTree, "financial"),
    ],
    related: [rel("company/regional", "currency"), rel("offers/defaults", "vat_rates")],
  },
  {
    id: "tickets", group: "work", icon: LifeBuoy, tint: "purple",
    sections: [
      S("statuses", CircleDot, "general_config"),
      S("intake", Inbox, "general_config"),
    ],
    related: [rel("email/outgoing", "outgoing_server"), rel("email/mailboxes", "company_mailboxes")],
  },
  // ── Connections & system ──────────────────────────────────────────────────
  {
    id: "email", group: "connections", icon: Mail, tint: "rose",
    sections: [
      S("outgoing", Send, "general_config"),
      S("mailboxes", Inbox, "general_config", { adminOnly: true }),
      S("test", MailCheck, "general_config"),
    ],
    related: [rel("tickets/intake", "ticket_mailbox"), rel("integrations/ai", "ai_replies")],
  },
  {
    id: "integrations", group: "connections", icon: Plug, tint: "fuchsia",
    sections: [
      S("api", Key, "general_config"),
      S("ai", Bot, "ai_config"),
      S("usage", Coins, "ai_config"),
      S("ads", Megaphone, "general_config"),
      S("social", Share2, "general_config", { flag: "social" }),
    ],
    related: [rel("leads/intake", "web_form_fields"), rel("system/errors", "error_logs")],
  },
  {
    id: "system", group: "connections", icon: Server, tint: "slate",
    sections: [
      S("license", KeyRound, "general_config"),
      S("server", Database, "general_config"),
      S("errors", Bug, "general_config"),
      S("reset", TriangleAlert, "system_reset"),
    ],
    related: [rel("access/audit", "audit_log"), rel("company/regional", "language_currency")],
  },
];

export const SETTINGS_GROUP_ORDER: SettingsGroupId[] = ["organization", "work", "connections"];

export const SETTINGS_GROUPS: SettingsGroupDef[] = SETTINGS_GROUP_ORDER.map((id) => ({
  id,
  categories: SETTINGS_CATEGORIES.filter((c) => c.group === id),
}));

// ── Translation keys ──────────────────────────────────────────────────────────

export const groupLabelKey = (g: SettingsGroupId) => `settings.nav.group.${g}`;
export const categoryKey = (c: string, part: "title" | "desc" | "hint" | "subtitle" | "help_title" | "help_body") =>
  `settings.nav.cat.${c}.${part}`;
export const sectionKey = (c: string, s: string, part: "title" | "hint" | "kw") =>
  `settings.nav.sec.${c}.${s}.${part}`;

// ── Lookups ───────────────────────────────────────────────────────────────────

export const findCategory = (id: string | null | undefined): SettingsCategoryDef | undefined =>
  SETTINGS_CATEGORIES.find((c) => c.id === id);

export const findSection = (categoryId: string, sectionId: string | null | undefined): SettingsSectionDef | undefined =>
  findCategory(categoryId)?.sections.find((s) => s.id === sectionId);

/** `category/section` → both definitions, or undefined for an id the registry does not know. */
export const resolveSectionRef = (
  ref: string,
): { category: SettingsCategoryDef; section: SettingsSectionDef } | undefined => {
  const [c, s] = ref.split("/");
  const category = findCategory(c);
  const section = category?.sections.find((x) => x.id === s);
  return category && section ? { category, section } : undefined;
};

export const sectionRef = (categoryId: string, sectionId: string) => `${categoryId}/${sectionId}`;

/** Every `category/section` the registry defines, flag-independent. */
export const ALL_SECTION_REFS: string[] = SETTINGS_CATEGORIES.flatMap((c) => c.sections.map((s) => sectionRef(c.id, s.id)));

// ── Visibility ────────────────────────────────────────────────────────────────

export interface SettingsVisibilityContext {
  /** Same shape as App's `getPermission`: "nothing" | "view" | "edit". */
  getPermission: (key: string) => string;
  isAdmin: boolean;
  flags: Record<SettingsFlag, boolean>;
}

export const isSectionVisible = (s: SettingsSectionDef, ctx: SettingsVisibilityContext): boolean => {
  if (s.flag && !ctx.flags[s.flag]) return false;
  if (s.adminOnly && !ctx.isAdmin) return false;
  return ctx.getPermission(s.permKey) !== "nothing";
};

export interface VisibleCategory {
  def: SettingsCategoryDef;
  sections: SettingsSectionDef[];
}

/** Categories with at least one section the user may see, in registry order. */
export const visibleCategories = (ctx: SettingsVisibilityContext): VisibleCategory[] =>
  SETTINGS_CATEGORIES.map((def) => ({ def, sections: def.sections.filter((s) => isSectionVisible(s, ctx)) })).filter(
    (c) => c.sections.length > 0,
  );

export const visibleGroups = (ctx: SettingsVisibilityContext) => {
  const cats = visibleCategories(ctx);
  return SETTINGS_GROUP_ORDER.map((id) => ({ id, categories: cats.filter((c) => c.def.group === id) })).filter(
    (g) => g.categories.length > 0,
  );
};

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * Every `#settings/<id>` that existed before the regrouping, and where it goes now.
 * An id that is also a category id today (`projects`, `tickets`, `orders`,
 * `finance`, `email`, `modules`) needs no entry: the category page opens on the
 * same content. `general` was never a tab of its own but is kept for old notes.
 */
export const LEGACY_SETTINGS_ROUTES: Record<string, string> = {
  general: "company/profile",
  branding: "company/profile",
  modules: "modules/visible",
  license: "system/license",
  invoicing: "company/billing",
  projects: "projects/types",
  tickets: "tickets/statuses",
  orders: "orders/statuses",
  tasks: "projects/tasks",
  "time-tracking": "projects/time",
  task_states: "projects/taskstates",
  finance: "finance/ledger",
  unified: "modules/records",
  sources: "leads/sources",
  states: "leads/stages",
  managers: "access/users",
  rbac: "access/roles",
  email: "email/outgoing",
  api: "integrations/api",
  ads: "integrations/ads",
  social: "integrations/social",
  ai: "integrations/ai",
  errors: "system/errors",
  audit: "access/audit",
  danger: "system/reset",
};

export interface ParsedSettingsRoute {
  /** "home" is `settings`; "category" is `settings/<category>[/<section>]`. */
  kind: "home" | "category";
  categoryId: string | null;
  sectionId: string | null;
  /** Anything after the section: `new` / `edit/<id>` of the custom record types. */
  rest: string[];
  /** The route was an old id (or a bare one the registry also knows) that should be rewritten. */
  redirectTo: string | null;
}

/**
 * Reads a route such as `settings/company/billing` or the old `settings/invoicing`.
 * Unknown ids fall back to the home screen; old ids carry the route they now live at.
 */
export const parseSettingsRoute = (route: string): ParsedSettingsRoute => {
  const path = route.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const home: ParsedSettingsRoute = { kind: "home", categoryId: null, sectionId: null, rest: [], redirectTo: null };
  if (parts[0] !== "settings" || parts.length < 2) return home;

  const first = parts[1];
  const tail = parts.slice(2);

  // `settings/<category>/<section>` — the current shape.
  const category = findCategory(first);
  if (category) {
    const section = category.sections.find((s) => s.id === parts[2]);
    if (section) {
      return { kind: "category", categoryId: category.id, sectionId: section.id, rest: parts.slice(3), redirectTo: null };
    }
    // `settings/modules/records`-style typos or a section removed later: show the category.
    return { kind: "category", categoryId: category.id, sectionId: null, rest: [], redirectTo: parts[2] ? `settings/${category.id}` : null };
  }

  // An old id: `settings/invoicing`, `settings/unified/new`, `settings/unified/edit/<id>`.
  const legacy = LEGACY_SETTINGS_ROUTES[first];
  if (legacy) {
    const [c, s] = legacy.split("/");
    return {
      kind: "category",
      categoryId: c,
      sectionId: s,
      rest: tail,
      redirectTo: `settings/${legacy}${tail.length ? "/" + tail.join("/") : ""}`,
    };
  }
  return home;
};

export const settingsPath = (categoryId?: string | null, sectionId?: string | null): string =>
  categoryId ? (sectionId ? `settings/${categoryId}/${sectionId}` : `settings/${categoryId}`) : "settings";

/** The first section the user may open, for the sidebar layout's `settings` landing and permission fallbacks. */
export const firstVisibleRef = (ctx: SettingsVisibilityContext): string | null => {
  const first = visibleCategories(ctx)[0];
  return first ? sectionRef(first.def.id, first.sections[0].id) : null;
};

/** Drops ids the registry no longer knows or the user cannot see; keeps order and uniqueness. */
export const cleanRecents = (recents: unknown, ctx: SettingsVisibilityContext, max = 6): string[] => {
  if (!Array.isArray(recents)) return [];
  const out: string[] = [];
  for (const ref of recents) {
    if (typeof ref !== "string" || out.includes(ref)) continue;
    const hit = resolveSectionRef(ref);
    if (hit && isSectionVisible(hit.section, ctx)) out.push(ref);
    if (out.length >= max) break;
  }
  return out;
};

/** `ref` first, the rest after it, capped. */
export const pushRecent = (recents: string[], ref: string, max = 6): string[] =>
  [ref, ...recents.filter((r) => r !== ref)].slice(0, max);
