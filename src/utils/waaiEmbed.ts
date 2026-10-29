/**
 * The CRM half of the WhatsApp module's conversation with the embedded WAAI page
 * (docs/WAAI-INTEGRATION.md §4.7): which pages WAAI may be sent to, how a CRM address
 * becomes a WAAI path and back, and what to believe of a message from the frame.
 * Pure functions, no I/O. WAAI keeps its own copy of the path list (`embed-paths.ts`
 * in the WAAI repository); the two must agree.
 */

import { recordHref, type ClientRecordLike } from "./clientRecord.ts";

const STATIC_PATHS = new Set(["/", "/digest", "/tasks", "/search", "/settings"]);
const CHAT_PATH = /^\/c\/[A-Za-z0-9_-]{1,64}(\?m=[A-Za-z0-9_-]{1,64})?$/;
const OPEN_PATH = /^\/open\?phone=\d{5,20}(&(lead|project)=[A-Za-z0-9_-]{1,50})?$/;

/** The path itself when WAAI may be sent there, else null. */
export function safeWaaiPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300) return null;
  return STATIC_PATHS.has(raw) || CHAT_PATH.test(raw) || OPEN_PATH.test(raw) ? raw : null;
}

/**
 * `#whatsapp/c/<id>?m=<id>` (route `whatsapp/c/<id>`, query `m=…`) → the WAAI path `/c/<id>?m=…`.
 * An address WAAI may not open falls back to its chat list.
 */
export function waaiPathFromRoute(route: string, params: URLSearchParams): string {
  const rest = route.replace(/^whatsapp/i, "");
  const query = params.toString();
  const path = (rest === "" ? "/" : rest) + (query ? `?${query}` : "");
  return safeWaaiPath(path) ?? "/";
}

/** The CRM address (without the `#`) for a path WAAI reported: `/c/x?m=y` → `whatsapp/c/x?m=y`, `/` → `whatsapp`. */
export function routeFromWaaiPath(path: string): string | null {
  const safe = safeWaaiPath(path);
  if (safe === null) return null;
  return safe === "/" ? "whatsapp" : `whatsapp${safe}`;
}

/** The address of the page that signs in, loaded in the frame. `base` is the embed origin. */
export function embedFrameUrl(base: string, next: string): string {
  return `${base.replace(/\/+$/, "")}/embed/sso?next=${encodeURIComponent(safeWaaiPath(next) ?? "/")}`;
}

/** The origin of the embed address, or null when it is not an http(s) address. */
export function embedOrigin(base: string | null | undefined): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export type WaaiMessage =
  | { type: "waai:ready"; authed: boolean; userCrmId: string | null }
  | { type: "waai:route"; path: string; title: string }
  | { type: "waai:unread"; chats: number }
  | { type: "waai:open-crm"; kind: "lead" | "project" | "task"; id: string }
  | { type: "waai:error"; code: string };

/** A message from the frame, checked field by field; null for anything that is not one of ours. */
export function parseWaaiMessage(data: unknown): WaaiMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "waai:ready":
      return {
        type: "waai:ready",
        authed: m.authed === true,
        userCrmId: typeof m.userCrmId === "string" && m.userCrmId.length <= 64 ? m.userCrmId : null,
      };
    case "waai:route": {
      const path = safeWaaiPath(m.path);
      if (path === null) return null;
      return { type: "waai:route", path, title: typeof m.title === "string" ? m.title.slice(0, 120) : "" };
    }
    case "waai:unread": {
      const n = m.chats;
      return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 99999 ? { type: "waai:unread", chats: n } : null;
    }
    case "waai:open-crm": {
      const kind = m.kind;
      const id = m.id;
      if ((kind !== "lead" && kind !== "project" && kind !== "task") || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        return null;
      }
      return { type: "waai:open-crm", kind, id };
    }
    case "waai:error":
      return typeof m.code === "string" && /^[a-z_]{1,40}$/.test(m.code) ? { type: "waai:error", code: m.code } : null;
    default:
      return null;
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

export type EmbedState = "not_configured" | "loading" | "not_linked" | "error" | "ready";
