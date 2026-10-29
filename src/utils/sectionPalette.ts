/**
 * Section groups and their colours. No icons here — this file is imported by
 * the unit tests, which cannot load JSX. The matching glyph lives in
 * `sectionVisuals.ts`.
 *
 *   Insight        indigo    dashboard, analytics
 *   Work           orange    tasks, meetings, time tracking
 *   People         teal      clients, leads, employees
 *   Delivery       purple    projects, tickets
 *   Commerce       blue      warehouse, orders
 *   Money          emerald   finances, price offers
 *   Intelligence   violet    RAG, automation, SAI
 *   Communication  rose      mail, social
 *   Reference      amber     files, updates
 */

export type SectionGroupId =
  | "insight"
  | "work"
  | "people"
  | "delivery"
  | "commerce"
  | "money"
  | "intelligence"
  | "communication"
  | "reference";

export type SectionVisualId =
  | "dashboard"
  | "overview"
  | "tasks"
  | "meetings"
  | "time-tracking"
  | "clients"
  | "leads"
  | "employees"
  | "projects"
  | "tickets"
  | "warehouse"
  | "orders"
  | "financial"
  | "invoices"
  | "rag_ai"
  | "automation"
  | "sai"
  | "email"
  | "social_media"
  | "whatsapp"
  | "files"
  | "updates";

export interface SectionPaletteEntry {
  id: SectionVisualId;
  group: SectionGroupId;
  /** Lucide (or custom) component name. */
  glyph: string;
  color: string;
}

const entry = (
  id: SectionVisualId,
  group: SectionGroupId,
  glyph: string,
  color: string
): SectionPaletteEntry => ({ id, group, glyph, color });

export const SECTION_PALETTE: Record<SectionVisualId, SectionPaletteEntry> = {
  dashboard: entry("dashboard", "insight", "LayoutDashboard", "#4f46e5"),
  overview: entry("overview", "insight", "BarChart3", "#6366f1"),

  tasks: entry("tasks", "work", "ListTodo", "#c2410c"),
  meetings: entry("meetings", "work", "PencilLine", "#ea580c"),
  "time-tracking": entry("time-tracking", "work", "Timer", "#9a3412"),

  clients: entry("clients", "people", "Users", "#115e59"),
  leads: entry("leads", "people", "TableProperties", "#0f766e"),
  employees: entry("employees", "people", "EmployeeTieIcon", "#0d9488"),

  projects: entry("projects", "delivery", "Briefcase", "#6b21a8"),
  tickets: entry("tickets", "delivery", "LifeBuoy", "#7e22ce"),

  warehouse: entry("warehouse", "commerce", "Package", "#1e40af"),
  orders: entry("orders", "commerce", "ClipboardList", "#2563eb"),

  financial: entry("financial", "money", "Coins", "#047857"),
  invoices: entry("invoices", "money", "FileText", "#059669"),

  rag_ai: entry("rag_ai", "intelligence", "Brain", "#5b21b6"),
  automation: entry("automation", "intelligence", "Workflow", "#6d28d9"),
  sai: entry("sai", "intelligence", "FlockIcon", "#7c3aed"),

  email: entry("email", "communication", "Mail", "#be123c"),
  social_media: entry("social_media", "communication", "Share2", "#e11d48"),
  whatsapp: entry("whatsapp", "communication", "MessageCircle", "#15803d"),

  files: entry("files", "reference", "FolderOpen", "#b45309"),
  updates: entry("updates", "reference", "Sparkles", "#d97706"),
};
