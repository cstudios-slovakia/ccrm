/**
 * The module's address space. `#whatsapp…` addresses already exist in the wild - client chips and the
 * footers of tasks that WAAI wrote into the CRM link to `#whatsapp/c/<id>` - so these formats must keep
 * working (docs/WAAI-NATIVE-MODULE.md §4.6).
 */

import { recordHref, type ClientRecordLike } from "../../../utils/clientRecord.ts";

export type WaTab = "chats" | "digest" | "tasks" | "ask" | "settings";

export const WA_TABS: readonly WaTab[] = ["chats", "digest", "tasks", "ask", "settings"];

/** `whatsapp`, `whatsapp/c/<id>`, `whatsapp/u/<user>/c/<id>`, `whatsapp/open` -> chats; `whatsapp/digest` -> digest; and so on. */
export function tabFromRoute(route: string): WaTab {
  const [, section = ""] = route.toLowerCase().split("/");
  switch (section) {
    case "digest":
      return "digest";
    case "tasks":
      return "tasks";
    case "search":
      return "ask";
    case "settings":
      return "settings";
    default:
      return "chats";
  }
}

/** The address (without the `#`) a tab opens. */
export function routeForTab(tab: WaTab): string {
  switch (tab) {
    case "digest":
      return "whatsapp/digest";
    case "tasks":
      return "whatsapp/tasks";
    case "ask":
      return "whatsapp/search";
    case "settings":
      return "whatsapp/settings";
    default:
      return "whatsapp";
  }
}

/**
 * Where "open in CRM" goes (the address without the `#`). A "lead" is a client when it is one - a `client-…` id or
 * a lead with a confirmed value adjustment, the app's one rule (`recordHref`) - and clients are routed by name;
 * a plain lead by id. A project is `projects/<id>`; a task opens the task list on that task.
 */
export function crmHashForRecord(
  kind: "lead" | "project" | "task",
  id: string,
  findLead: (leadId: string) => ClientRecordLike | undefined,
): string {
  if (kind === "project") return `projects/${id}`;
  if (kind === "task") return `tasks?task=${id}`;
  return recordHref(findLead(id) ?? { id }).replace(/^#/, "");
}

/** What the sidebar shows for the module: nothing for zero, `99+` above that. */
export function unreadLabel(chats: number): string {
  return chats <= 0 ? "" : chats > 99 ? "99+" : String(chats);
}
