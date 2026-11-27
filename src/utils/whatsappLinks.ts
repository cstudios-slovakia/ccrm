/**
 * WhatsApp chats WAAI has paired with clients, leads and projects, and what to show for each
 * (docs/WAAI-INTEGRATION.md §4.4, §4.8). WAAI decides the pairing; this file only looks the answer up.
 * Pure functions, no I/O.
 */
import { resolveLinkedClient, type LeadLike } from "./leadClient.ts";

/** One chat paired with one CRM record, as `sync.php` sends it (`whatsappLinks`). */
export interface WhatsAppLink {
  conversationRef: string;
  entityType: "lead" | "project";
  entityId: string;
  source: "auto" | "manual";
  title: string;
  isGroup: boolean;
  /** Digits with the country code; null for a group or a contact known only by a hidden id. */
  phone: string | null;
  /** CCRM user whose WhatsApp account holds the chat. */
  ownerUserId: string | null;
  /** Deep link inside WAAI, `/c/<conversationId>`. */
  path: string;
  lastMessageAt: string | null;
}

/** Answer of WAAI's on-demand "is this number on WhatsApp?" check (`whatsappNumbers`). */
export interface WhatsAppNumber {
  phone: string;
  status: "registered" | "not_registered";
  checkedAt: string | null;
}

export interface WhatsAppData {
  links: WhatsAppLink[];
  numbers: WhatsAppNumber[];
}

export const EMPTY_WHATSAPP_DATA: WhatsAppData = { links: [], numbers: [] };

/** `chat` = a paired chat exists, `start` = a number we can open a new chat to, `none` = nothing to offer. */
export type WhatsAppState = "chat" | "start" | "none";

/** Parses the `whatsappLinks` / `whatsappNumbers` keys of a sync response; anything malformed is dropped. */
export function parseWhatsAppData(links: unknown, numbers: unknown): WhatsAppData {
  const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const outLinks: WhatsAppLink[] = [];
  for (const raw of Array.isArray(links) ? links : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const conversationRef = text(r.conversationRef);
    const entityId = text(r.entityId);
    const path = text(r.path);
    if (!conversationRef || !entityId || !path) continue;
    if (r.entityType !== "lead" && r.entityType !== "project") continue;
    outLinks.push({
      conversationRef,
      entityType: r.entityType,
      entityId,
      source: r.source === "manual" ? "manual" : "auto",
      title: text(r.title) ?? "",
      isGroup: r.isGroup === true,
      phone: text(r.phone),
      ownerUserId: text(r.ownerUserId),
      path,
      lastMessageAt: text(r.lastMessageAt),
    });
  }
  const outNumbers: WhatsAppNumber[] = [];
  for (const raw of Array.isArray(numbers) ? numbers : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const phone = text(r.phone);
    if (!phone || (r.status !== "registered" && r.status !== "not_registered")) continue;
    outNumbers.push({ phone, status: r.status, checkedAt: text(r.checkedAt) });
  }
  return { links: outLinks, numbers: outNumbers };
}

/** True when two parses carry the same data, so a poll that changed nothing keeps the old reference. */
export const sameWhatsAppData = (a: WhatsAppData, b: WhatsAppData): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------------------
// Phone numbers. Same rules as WAAI's `normalizePhoneDigits` (packages/crm-client/src/phone.ts): CCRM numbers
// are free text, WhatsApp wants digits with the country code.
// ---------------------------------------------------------------------------------------------------------

const CALLING_CODES: Record<string, string> = {
  SK: "421", CZ: "420", HU: "36", AT: "43", DE: "49", PL: "48", CH: "41", GB: "44", UA: "380",
  RO: "40", HR: "385", SI: "386", IT: "39", FR: "33", NL: "31", BE: "32", US: "1",
};
const TRUNK_PREFIX: Record<string, string> = { "36": "06" };
const NO_TRUNK = new Set(["420", "48", "39", "1"]);
const NATIONAL_LENGTH: Record<string, number> = { "420": 9, "48": 9 };
const KNOWN_CODES = [...new Set(Object.values(CALLING_CODES))].sort((a, b) => b.length - a.length);

const COUNTRY_NAMES: Record<string, string> = {
  sk: "SK", slovakia: "SK", slovensko: "SK", szlovakia: "SK", slovak: "SK",
  cz: "CZ", czechia: "CZ", "czech republic": "CZ", cesko: "CZ", "ceska republika": "CZ", csehorszag: "CZ",
  hu: "HU", hungary: "HU", madarsko: "HU", magyarorszag: "HU",
  at: "AT", austria: "AT", rakusko: "AT", osterreich: "AT", ausztria: "AT",
  de: "DE", germany: "DE", nemecko: "DE", deutschland: "DE", nemetorszag: "DE",
  pl: "PL", poland: "PL", polsko: "PL", lengyelorszag: "PL",
  ch: "CH", switzerland: "CH", svajciarsko: "CH", schweiz: "CH", svajc: "CH",
  gb: "GB", uk: "GB", "united kingdom": "GB", "velka britania": "GB",
  ua: "UA", ukraine: "UA", ukrajina: "UA", ukrajna: "UA",
  ro: "RO", romania: "RO", rumunsko: "RO",
  hr: "HR", croatia: "HR", chorvatsko: "HR", horvatorszag: "HR",
  si: "SI", slovenia: "SI", slovinsko: "SI", szlovenia: "SI",
  it: "IT", italy: "IT", taliansko: "IT", olaszorszag: "IT",
  fr: "FR", france: "FR", francuzsko: "FR", franciaorszag: "FR",
  nl: "NL", netherlands: "NL", holandsko: "NL", hollandia: "NL",
  be: "BE", belgium: "BE", belgicko: "BE",
  us: "US", usa: "US", "united states": "US",
};

const fold = (value: string): string => value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();

/** Calling code (digits) for a country name or ISO code as typed in the CRM; `fallback` when unknown. */
export function callingCodeForCountry(country: string | null | undefined, fallback = "421"): string {
  if (!country) return fallback;
  const iso = COUNTRY_NAMES[fold(country)];
  return iso ? (CALLING_CODES[iso] ?? fallback) : fallback;
}

/**
 * Digits with the country code: `0905…` becomes `421905…`, `00421…` and `+421…` lose their prefix, a
 * written-out trunk zero (`+421 (0)905…`) is dropped. `country` is the record's country as typed; it applies
 * only to a number written without a country code. Null when what is left is not 8 to 15 digits.
 */
export function normalizePhoneDigits(raw: string | null | undefined, country?: string | null): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const cc = callingCodeForCountry(country);
  let digits = text.replace(/\D+/g, "");
  const international = text.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00") && !text.startsWith("+")) digits = digits.slice(2);

  if (international) {
    const code = KNOWN_CODES.find((c) => digits.startsWith(c));
    if (code && digits[code.length] === "0") digits = code + digits.slice(code.length + 1);
  } else {
    const trunk = TRUNK_PREFIX[cc] ?? "0";
    if (digits.startsWith(trunk)) digits = cc + digits.slice(trunk.length);
    else if (digits.startsWith("0") && trunk !== "0") digits = cc + digits.slice(1);
    else if (digits.startsWith(cc + "0")) digits = cc + digits.slice(cc.length + 1);
    else if (NO_TRUNK.has(cc) && !digits.startsWith(cc) && digits.length === (NATIONAL_LENGTH[cc] ?? -1)) digits = cc + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

// ---------------------------------------------------------------------------------------------------------
// Which chats belong to a record
// ---------------------------------------------------------------------------------------------------------

/** A chat can be paired with several records; list it once per conversation. */
function uniqueChats(links: WhatsAppLink[]): WhatsAppLink[] {
  const seen = new Set<string>();
  const out: WhatsAppLink[] = [];
  for (const l of links) {
    if (seen.has(l.conversationRef)) continue;
    seen.add(l.conversationRef);
    out.push(l);
  }
  return out;
}

/** The lead ids that stand for one customer: the client record and every lead that points at it. */
function leadFamily<T extends LeadLike>(lead: T, leads: T[]): Set<string> {
  const ids = new Set<string>();
  if (lead.id) ids.add(lead.id);
  const client = resolveLinkedClient(lead, leads);
  if (!client?.id) return ids;
  ids.add(client.id);
  for (const other of leads) {
    if (other.id && resolveLinkedClient(other, leads)?.id === client.id) ids.add(other.id);
  }
  return ids;
}

/** Chats of a lead: its own, its client's, and those of the client's other leads. */
export function linksForLead<T extends LeadLike>(leadId: string, links: WhatsAppLink[], leads: T[]): WhatsAppLink[] {
  const lead = leads.find((l) => l.id === leadId);
  const family = lead ? leadFamily(lead, leads) : new Set([leadId]);
  return uniqueChats(links.filter((l) => l.entityType === "lead" && family.has(l.entityId)));
}

export interface ProjectLinkInput {
  id: string;
  leadId?: string | null;
  clientId?: string | null;
  contactPhone?: string | null;
}

/**
 * Chats of a project: those paired with it, those of its client, those of the leads named in its contact
 * attributes (`contactLeadIds`), and any chat whose number is the project's `contactPhone`.
 */
export function linksForProject<T extends LeadLike>(
  project: ProjectLinkInput,
  links: WhatsAppLink[],
  leads: T[],
  contactLeadIds: string[] = [],
): WhatsAppLink[] {
  const ids = new Set<string>();
  for (const id of [project.leadId, project.clientId, ...contactLeadIds]) {
    if (!id) continue;
    const lead = leads.find((l) => l.id === id);
    for (const member of lead ? leadFamily(lead, leads) : [id]) ids.add(member);
  }
  const phone = normalizePhoneDigits(project.contactPhone, countryOfProject(project, leads));
  return uniqueChats(
    links.filter(
      (l) =>
        (l.entityType === "project" && l.entityId === project.id) ||
        (l.entityType === "lead" && ids.has(l.entityId)) ||
        (phone !== null && !l.isGroup && l.phone === phone),
    ),
  );
}

function countryOfProject<T extends LeadLike>(project: ProjectLinkInput, leads: T[]): string | null {
  const lead = leads.find((l) => l.id === (project.leadId ?? project.clientId));
  return ((lead as { address?: { country?: string }; country?: string } | undefined)?.address?.country
    ?? (lead as { country?: string } | undefined)?.country) || null;
}

/** The viewer's own chats first, then other people's (shown but marked: WAAI refuses to open them), newest first. */
export function orderLinks(chats: WhatsAppLink[], viewerId: string | null | undefined): WhatsAppLink[] {
  const mine = (l: WhatsAppLink) => (viewerId && l.ownerUserId === viewerId ? 0 : 1);
  return [...chats].sort((a, b) => mine(a) - mine(b) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || a.title.localeCompare(b.title));
}

export const isOwnChat = (l: WhatsAppLink, viewerId: string | null | undefined): boolean => !!viewerId && l.ownerUserId === viewerId;

/**
 * What the chip offers. A paired chat wins. Without one, a number we can normalise offers "Start chat" unless
 * WAAI already found out the number is not on WhatsApp.
 */
export function resolveWhatsAppState(
  chats: WhatsAppLink[],
  rawPhone: string | null | undefined,
  country: string | null | undefined,
  numbers: WhatsAppNumber[],
): { state: WhatsAppState; phone: string | null } {
  const phone = normalizePhoneDigits(rawPhone, country);
  if (chats.length > 0) return { state: "chat", phone };
  if (!phone) return { state: "none", phone: null };
  if (numbers.some((n) => n.phone === phone && n.status === "not_registered")) return { state: "none", phone };
  return { state: "start", phone };
}

// ---------------------------------------------------------------------------------------------------------
// Where a click goes (the WhatsApp module itself arrives with phase 7)
// ---------------------------------------------------------------------------------------------------------

/** `#whatsapp/c/<id>`; a message deep link (`/c/<id>?m=<id>`) keeps its query. */
export const chatHref = (path: string): string => `#whatsapp${path.startsWith("/") ? path : `/${path}`}`;

/** `#whatsapp/open?phone=…&lead=…|project=…` — WAAI opens the existing chat or checks the number once. */
export function startChatHref(phone: string, target: { leadId?: string | null; projectId?: string | null }): string {
  const params = new URLSearchParams({ phone });
  if (target.projectId) params.set("project", target.projectId);
  else if (target.leadId) params.set("lead", target.leadId);
  return `#whatsapp/open?${params.toString()}`;
}
