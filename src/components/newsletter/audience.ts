/**
 * Newsletter audience helpers (docs/NEWSLETTER.md C5, C12): the defaults, the validity rule, the
 * readable label and the live parse feedback of the pasted extra addresses. Pure, no React.
 *
 * The server resolves who actually receives mail (`newsletter_audience.php`); nothing here decides
 * a recipient list, it only shapes what the editor shows.
 */

import type { Audience } from "./types";

type TFn = (en: string, sk: string, hu: string) => string;

export const defaultAudience = (): Audience => ({
  clients: { mode: "all", categoryIds: [], clientIds: [] },
  leads: { enabled: false, statuses: [], interestCategories: [] },
  employees: { enabled: false },
  extra: { enabled: false, raw: "" },
});

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Fills every missing part of an audience from the server (or an older client) with the defaults. */
export const normalizeAudience = (raw: Partial<Audience> | null | undefined): Audience => {
  const d = defaultAudience();
  if (!raw || typeof raw !== "object") return d;
  return {
    clients: {
      mode: raw.clients?.mode === "pick" ? "pick" : "all",
      categoryIds: strings(raw.clients?.categoryIds),
      clientIds: strings(raw.clients?.clientIds),
    },
    leads: {
      enabled: !!raw.leads?.enabled,
      statuses: strings(raw.leads?.statuses),
      interestCategories: strings(raw.leads?.interestCategories),
    },
    employees: { enabled: !!raw.employees?.enabled },
    extra: { enabled: !!raw.extra?.enabled, raw: typeof raw.extra?.raw === "string" ? raw.extra.raw : "" },
  };
};

/** C5: valid when all clients, or a pick with at least one category or client. */
export const isAudienceValid = (a: Audience): boolean =>
  a.clients.mode === "all" || a.clients.categoryIds.length > 0 || a.clients.clientIds.length > 0;

export type ExtraParse = { valid: string[]; invalid: string[] };

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Splits on new lines, commas and semicolons; accepts `a@b.c` and `Name <a@b.c>`. Duplicates count once. */
export const parseExtraAddresses = (raw: string): ExtraParse => {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n\r,;]+/)) {
    const piece = part.trim();
    if (!piece) continue;
    const angle = piece.match(/<([^<>]*)>\s*$/);
    const addr = (angle ? angle[1] : piece).trim().toLowerCase();
    if (EMAIL.test(addr)) {
      if (!seen.has(addr)) {
        seen.add(addr);
        valid.push(addr);
      }
    } else {
      invalid.push(piece);
    }
  }
  return { valid, invalid };
};

/** "All clients", "2 categories, 3 clients + leads + employees + 4 addresses" (C12). */
export const audienceLabel = (a: Audience, t: TFn): string => {
  const parts: string[] = [];
  if (a.clients.mode === "all") {
    parts.push(t("All clients", "Všetci klienti", "Minden ügyfél"));
  } else {
    const bits: string[] = [];
    const cats = a.clients.categoryIds.length;
    const clients = a.clients.clientIds.length;
    if (cats) bits.push(`${cats} ${cats === 1 ? t("category", "kategória", "kategória") : t("categories", "kategórie", "kategória")}`);
    if (clients) bits.push(`${clients} ${clients === 1 ? t("client", "klient", "ügyfél") : t("clients", "klientov", "ügyfél")}`);
    parts.push(bits.length ? bits.join(", ") : t("No clients chosen", "Nie sú vybraní klienti", "Nincs ügyfél kiválasztva"));
  }
  const extras: string[] = [];
  if (a.leads.enabled) extras.push(t("leads", "leady", "érdeklődők"));
  if (a.employees.enabled) extras.push(t("employees", "zamestnanci", "munkatársak"));
  if (a.extra.enabled) extras.push(t("extra addresses", "ďalšie adresy", "további címek"));
  return extras.length ? `${parts.join(" ")} + ${extras.join(" + ")}` : parts.join(" ");
};
