/**
 * The module's address space. `#whatsapp…` addresses already exist in the wild - client chips and the
 * footers of tasks that WAAI wrote into the CRM link to `#whatsapp/c/<id>` - so these formats must keep
 * working (docs/WAAI-NATIVE-MODULE.md §4.6). `src/utils/waaiEmbed.ts` still owns the path helpers of the
 * embedded interface until the iframe goes (Phase 8).
 */

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
