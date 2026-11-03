import type { ChatCrmEntity } from "../api/contract.ts";

/**
 * The WhatsApp demo dataset (`public/api/demo_seed/whatsapp_demo.<edition>.json`, contract in
 * docs/WHATSAPP-DEMO-DATA.md) and how the browser gets it. The fake WAAI (`demoRouter.ts`) is built from it.
 */

export type DemoEdition = "sk" | "hu" | "en";

export interface DemoReaction {
  emoji: string;
  by: string;
}

export interface DemoMessage {
  id: string;
  day: number;
  /** `HH:MM` in the account's time zone. */
  time: string;
  dir: "in" | "out";
  sender?: string;
  kind: "text" | "image" | "document" | "audio";
  body: string;
  quote?: string;
  reactions?: DemoReaction[];
  fileName?: string;
  mime?: string;
  placeholder?: "slabs" | "samples" | "site";
  seconds?: number;
  transcription?: string;
}

export interface DemoTask {
  n: number;
  sourceMessage: string;
  status: "completed" | "open";
  /** A user ref: owner, pm or sales. */
  assignee: string;
  start?: { day: number };
  due: { day: number; time: string | null } | null;
  completed?: { day: number; time: string };
  leadId: string | null;
  projectId: string | null;
  title: string;
  description: string;
}

export interface DemoActionItem {
  /** A task number of the same chat, or null for a narrative bullet. */
  task: number | null;
  text: string;
}

export interface DemoChat {
  ref: string;
  title: string;
  isGroup: boolean;
  phone: string;
  locale: string;
  unread: number;
  members: string[];
  links: { entityType: "lead" | "project"; entityId: string; source: "auto" | "manual" }[];
  messages: DemoMessage[];
  tasks: DemoTask[];
  summary: { narrative: string; actionItems: DemoActionItem[] };
}

export interface DemoDataset {
  version: number;
  edition: DemoEdition;
  account: { sessionId: string; ownerCrmUser: string; phone: string; timezone: string };
  crmUsers: Record<string, { name: string; email: string }>;
  numbers: { phone: string; status: "registered" | "not_registered"; checkedDay: number }[];
  chats: DemoChat[];
}

/** What the CRM already holds about leads, clients and projects: names for the chat links and the picker. */
export interface DemoDirectory {
  get(type: "lead" | "project", id: string): { name: string; isClient: boolean } | null;
  /** The first 20 matches over leads, clients and projects. */
  search(q: string): ChatCrmEntity[];
}

export interface LoadedDemo {
  edition: DemoEdition;
  dataset: DemoDataset;
}

const isEdition = (v: unknown): v is DemoEdition => v === "sk" || v === "hu" || v === "en";

/**
 * GET `api/waai_demo.php`. `null` when the server says this is not a demo instance (404), so the caller falls
 * back to the state the real path would have shown. Any other failure throws.
 */
export async function loadDemoDataset(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<LoadedDemo | null> {
  const res = await fetchImpl("/api/waai_demo.php", { credentials: "same-origin", cache: "no-store" });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => null)) as { success?: unknown; edition?: unknown; dataset?: DemoDataset } | null;
  if (!res.ok || body?.success !== true || !isEdition(body.edition) || !body.dataset || !Array.isArray(body.dataset.chats)) {
    throw new Error("The demo dataset could not be loaded.");
  }
  return { edition: body.edition, dataset: body.dataset };
}
