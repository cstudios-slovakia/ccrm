/**
 * The full address of the native WhatsApp module (docs/WAAI-NATIVE-MODULE.md §4.6, "Routing"): which chat,
 * which message, which member's view, which settings section. `routes.ts` only answers "which tab"; this
 * file answers everything the tab needs to know. Pure functions, no I/O.
 *
 * The hash formats are fixed: chips on leads and projects and the footers WAAI wrote into CRM tasks
 * already link to them. `route` is the hash path without the `#` (`whatsapp/c/<id>`), `params` its query
 * (`?m=<id>`), exactly as `App.tsx` splits them.
 *
 *   #whatsapp                              chats, last chat reopened
 *   #whatsapp/c/<id>[?m=<msg>]             a chat, optionally at one message
 *   #whatsapp/u/<user>[/c/<id>[?m=<msg>]]  an admin looking at one member's chats
 *   #whatsapp/digest | tasks | search      the tabs
 *   #whatsapp/settings[/<section>]
 *   #whatsapp/open?phone=<digits>[&lead=<id>|&project=<id>]
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SECTION = /^[a-z][a-z0-9-]{0,40}$/;
const PHONE = /^\d{5,20}$/;
/** CRM record ids are shorter than WAAI ids. */
const CRM_ID = /^[A-Za-z0-9_-]{1,50}$/;

export type ChatsRoute = { view: "chats"; userId: string | null; conversationId: string | null; messageId: string | null };

export type WhatsAppRoute =
  | ChatsRoute
  | { view: "digest" }
  | { view: "tasks" }
  | { view: "search" }
  | { view: "settings"; section: string | null }
  | { view: "open"; phone: string; leadId: string | null; projectId: string | null };

const CHATS_HOME: ChatsRoute = { view: "chats", userId: null, conversationId: null, messageId: null };

function id(value: string | null | undefined): string | null {
  return value !== undefined && value !== null && ID.test(value) ? value : null;
}

/** The module route for an address; anything that is not one of ours opens the chat list. */
export function parseWhatsAppRoute(route: string, params: URLSearchParams = new URLSearchParams()): WhatsAppRoute {
  const parts = route.replace(/^\/+|\/+$/g, "").split("/");
  if (parts[0]?.toLowerCase() !== "whatsapp") return CHATS_HOME;
  const [, a, b, c, d] = parts;

  switch (a) {
    case undefined:
      return CHATS_HOME;
    case "c": {
      const conversationId = id(b);
      if (conversationId === null || c !== undefined) return CHATS_HOME;
      return { view: "chats", userId: null, conversationId, messageId: id(params.get("m")) };
    }
    case "u": {
      const userId = id(b);
      if (userId === null) return CHATS_HOME;
      if (c === undefined) return { ...CHATS_HOME, userId };
      const conversationId = c === "c" ? id(d) : null;
      if (conversationId === null) return { ...CHATS_HOME, userId };
      return { view: "chats", userId, conversationId, messageId: id(params.get("m")) };
    }
    case "digest":
    case "tasks":
    case "search":
      return { view: a };
    case "settings":
      return { view: "settings", section: b !== undefined && SECTION.test(b) ? b : null };
    case "open": {
      const phone = params.get("phone") ?? "";
      if (!PHONE.test(phone)) return CHATS_HOME;
      const lead = params.get("lead") ?? "";
      const project = params.get("project") ?? "";
      return {
        view: "open",
        phone,
        leadId: CRM_ID.test(lead) ? lead : null,
        projectId: !CRM_ID.test(lead) && CRM_ID.test(project) ? project : null,
      };
    }
    default:
      return CHATS_HOME;
  }
}

/** The address (hash path without `#`, query without `?`) of a route; the inverse of `parseWhatsAppRoute`. */
export function whatsAppRouteTarget(r: WhatsAppRoute): { route: string; query: string } {
  switch (r.view) {
    case "chats": {
      const base = r.userId ? `whatsapp/u/${r.userId}` : "whatsapp";
      if (r.conversationId === null) return { route: base, query: "" };
      return { route: `${base}/c/${r.conversationId}`, query: r.messageId ? `m=${r.messageId}` : "" };
    }
    case "settings":
      return { route: r.section ? `whatsapp/settings/${r.section}` : "whatsapp/settings", query: "" };
    case "open": {
      const q = new URLSearchParams({ phone: r.phone });
      if (r.leadId) q.set("lead", r.leadId);
      else if (r.projectId) q.set("project", r.projectId);
      return { route: "whatsapp/open", query: q.toString() };
    }
    default:
      return { route: `whatsapp/${r.view}`, query: "" };
  }
}

/** `#…` text for a route, ready for `location.hash`. */
export function whatsAppHash(r: WhatsAppRoute): string {
  const { route, query } = whatsAppRouteTarget(r);
  return `#${route}${query ? `?${query}` : ""}`;
}
