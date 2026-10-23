/*
  ── PRICE OFFER STATUS ──────────────────────────────────

  The statuses a price offer can be in are configured per installation
  (Price offers → Settings → Offer statuses), the same way project statuses
  are (utils/projects.ts). Each carries:

  - `key`    — what an offer stores in `status`. Given once and never changed,
               so renaming a status rewrites no offer.
  - `label`  — what it is called. Empty on the built-ins until someone renames
               one, so those keep speaking all three UI languages.
  - `color`  — a hex colour.
  - `group`  — what it means. The code only ever asks the group, never the key,
               so an added status behaves like the built-in it is grouped with:
                 draft      being prepared, not with the client yet
                 open       sent, waiting for the client
                 won        accepted — counts as won in the win rate
                 lost       rejected — counts as lost in the win rate
                 cancelled  withdrawn — leaves the win rate and is locked
  - `legacy` — kept only so offers that already carry it keep their meaning
               ("invoiced": an offer won and then invoiced, from before an
               invoice stopped being tied to its offer). A legacy status is not
               offered in a picker, except on an offer that already has it.

  Proformas and invoices share the `status` column and have a list of their own
  (Price offers → Settings → Invoice statuses), built the same way: one list for
  both, because a proforma and an invoice are settled the same way. Its defaults
  are DEFAULT_INVOICE_STATUS_DEFS, and the groups mean what they mean for an
  offer, read for money: `won` = invoiced / settled, `lost` = rejected,
  `cancelled` = withdrawn. What the finance ledger expects (invoiceFinanceBridge)
  is decided by group too, so renaming or adding a status never changes it.

  Mirrored by ccrm_offer_status_defs() in api/auth.php, which validates what
  the API and the MCP tools may write.
*/

export type OfferStatusGroup = "draft" | "open" | "won" | "lost" | "cancelled";

/** The groups in pipeline order — also the order the statuses are kept in. */
export const OFFER_STATUS_GROUPS: readonly OfferStatusGroup[] = ["draft", "open", "won", "lost", "cancelled"];

export interface OfferStatusDef {
  key: string;
  /** Empty while a built-in has not been renamed — it is then translated. */
  label?: string;
  color: string;
  group: OfferStatusGroup;
  legacy?: boolean;
}

type Translate = (en: string, sk: string, hu: string) => string;

/** en / sk / hu names of the built-in statuses. */
const BUILTIN_OFFER_STATUS_LABELS: Record<string, [string, string, string]> = {
  draft: ["Draft", "Návrh", "Piszkozat"],
  sent: ["Sent", "Odoslaná", "Elküldve"],
  approved: ["Approved", "Schválená", "Jóváhagyva"],
  rejected: ["Rejected", "Zamietnutá", "Elutasítva"],
  invoiced: ["Approved (invoiced)", "Schválená (vyfakturovaná)", "Jóváhagyva (kiszámlázva)"],
  cancelled: ["Cancelled", "Zrušená", "Törölve"],
};

const INVOICED_STATUS_LABEL: [string, string, string] = ["Invoiced", "Vyfakturovaná", "Kiszámlázva"];

/** What an installation that never opened the editor has. */
export const DEFAULT_OFFER_STATUS_DEFS: readonly OfferStatusDef[] = [
  { key: "draft", color: "#64748b", group: "draft" },
  { key: "sent", color: "#3b82f6", group: "open" },
  { key: "approved", color: "#10b981", group: "won" },
  { key: "invoiced", color: "#10b981", group: "won", legacy: true },
  { key: "rejected", color: "#f43f5e", group: "lost" },
  { key: "cancelled", color: "#f43f5e", group: "cancelled" },
];

/**
 * What an installation that never opened the invoice-status editor has: the six
 * statuses a proforma or an invoice always had. Unlike for an offer, `invoiced`
 * is a real, selectable status (it is what a paid order's invoice starts in),
 * so it is not legacy, and it comes first in its group.
 */
export const DEFAULT_INVOICE_STATUS_DEFS: readonly OfferStatusDef[] = [
  { key: "draft", color: "#64748b", group: "draft" },
  { key: "sent", color: "#3b82f6", group: "open" },
  { key: "invoiced", color: "#10b981", group: "won" },
  { key: "approved", color: "#10b981", group: "won" },
  { key: "rejected", color: "#f43f5e", group: "lost" },
  { key: "cancelled", color: "#f43f5e", group: "cancelled" },
];

/** What a status added in settings starts with. */
export const NEW_OFFER_STATUS_COLOR = "#6366f1";
/** An unknown status — written by something outside the app, or since deleted. */
const UNKNOWN_STATUS_COLOR = "#94a3b8";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_KEY_LENGTH = 50;

const isGroup = (value: unknown): value is OfferStatusGroup =>
  typeof value === "string" && (OFFER_STATUS_GROUPS as readonly string[]).includes(value);

/**
 * A stored list, cleaned up: unique non-empty keys, a known group, a hex
 * colour, kept in group order. Anything unreadable — nothing stored yet, a
 * malformed blob, a list emptied by hand — falls back to the built-ins, and so
 * does a list with nowhere for a new offer to start (no `draft` status).
 */
export const normalizeOfferStatusDefs = (
  raw: unknown,
  builtins: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): OfferStatusDef[] => {
  const defaults = () => builtins.map((d) => ({ ...d }));
  if (!Array.isArray(raw)) return defaults();
  const seen = new Set<string>();
  const out: OfferStatusDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = String(rec.key ?? "").trim();
    if (!key || key.length > MAX_KEY_LENGTH || seen.has(key)) continue;
    seen.add(key);
    const builtin = builtins.find((d) => d.key === key);
    const color = HEX_COLOR.test(String(rec.color ?? ""))
      ? String(rec.color).toLowerCase()
      : builtin?.color ?? NEW_OFFER_STATUS_COLOR;
    const group = isGroup(rec.group) ? rec.group : builtin?.group ?? "open";
    const label = String(rec.label ?? "").trim();
    const def: OfferStatusDef = { key, color, group };
    if (label) def.label = label;
    if (rec.legacy === true || builtin?.legacy) def.legacy = true;
    out.push(def);
  }
  if (!out.some((d) => d.group === "draft" && !d.legacy)) return defaults();
  return OFFER_STATUS_GROUPS.flatMap((g) => out.filter((d) => d.group === g));
};

/** The invoice / proforma list, cleaned up the same way, with its own built-ins. */
export const normalizeInvoiceStatusDefs = (raw: unknown): OfferStatusDef[] =>
  normalizeOfferStatusDefs(raw, DEFAULT_INVOICE_STATUS_DEFS);

/**
 * A key for a status added under `name`: the name folded to ASCII snake case,
 * made unique against `taken`. Only ever computed once — see `key` above.
 */
export const offerStatusKeyFor = (name: string, taken: readonly string[]): string => {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, MAX_KEY_LENGTH - 4) || "status";
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
};

const findStatus = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[],
): OfferStatusDef | undefined => {
  const key = String(status ?? "").trim();
  return key ? statuses.find((d) => d.key === key) : undefined;
};

/**
 * A status as a human reads it: the name given in settings, else the built-in
 * translation. An unknown one — a status since deleted, or a row written by
 * something outside the app — is shown raw rather than swallowed.
 */
export const offerStatusLabel = (
  status: string | undefined | null,
  t: Translate,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): string => {
  const key = String(status ?? "").trim();
  const def = findStatus(key, statuses);
  if (def?.label) return def.label;
  // `invoiced` reads "Approved (invoiced)" on an offer, where it is legacy, and plain "Invoiced" where it is a real status.
  const builtin = key === "invoiced" && def && !def.legacy ? INVOICED_STATUS_LABEL : BUILTIN_OFFER_STATUS_LABELS[key];
  return builtin ? t(builtin[0], builtin[1], builtin[2]) : key;
};

/** What a status means, or null for one the list does not know. */
export const offerStatusGroup = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): OfferStatusGroup | null => findStatus(status, statuses)?.group ?? null;

/** Won over the offers that reached a verdict; the win rate counts these. */
export const isWonOfferStatus = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): boolean => offerStatusGroup(status, statuses) === "won";

export const isLostOfferStatus = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): boolean => offerStatusGroup(status, statuses) === "lost";

/** The first status of a group, in list order — how code sets a status "by group". */
export const firstOfferStatusOf = (
  group: OfferStatusGroup,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): string | undefined => (statuses.find((d) => d.group === group && !d.legacy) ?? statuses.find((d) => d.group === group))?.key;

/** Where a new offer starts: the first draft status. */
export const defaultOfferStatus = (statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS): string =>
  firstOfferStatusOf("draft", statuses) ?? statuses[0]?.key ?? "draft";

/**
 * An invoice in this status is still expected income: neither turned down
 * (`lost`) nor withdrawn (`cancelled`). A status the list does not know counts as
 * live, as any status once did.
 */
export const isLiveInvoiceStatus = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[] = DEFAULT_INVOICE_STATUS_DEFS,
): boolean => {
  const group = offerStatusGroup(status, statuses);
  return group !== "lost" && group !== "cancelled";
};

/**
 * The status a freshly issued invoice starts in: the first "won" one when the
 * order behind it is already paid (it is settled), else the first "open" one
 * (sent, waiting for the money). Falls back to the keys invoices always used
 * if the list holds no status of that group.
 */
export const issuedInvoiceStatus = (
  paid: boolean,
  statuses: readonly OfferStatusDef[] = DEFAULT_INVOICE_STATUS_DEFS,
): string => (paid ? firstOfferStatusOf("won", statuses) ?? "invoiced" : firstOfferStatusOf("open", statuses) ?? "sent");

/** The status's hex colour; grey for one the list does not know. */
export const offerStatusColor = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): string => findStatus(status, statuses)?.color ?? UNKNOWN_STATUS_COLOR;

/** Badge colours, tinted from the status colour the way the project status badges are. */
export const offerStatusBadgeStyle = (
  status: string | undefined | null,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): { backgroundColor: string; color: string; borderColor: string } => {
  const color = offerStatusColor(status, statuses);
  return { backgroundColor: `${color}14`, color, borderColor: `${color}40` };
};

/**
 * The picker's options: every status that is not legacy, plus the offer's own
 * when it carries one that is legacy or no longer in the list — so the current
 * value never disappears from its own dropdown.
 */
export const offerStatusOptions = (
  t: Translate,
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
  current?: string | null,
): { value: string; label: string; color: string }[] => {
  const options = statuses
    .filter((d) => !d.legacy || d.key === current)
    .map((d) => ({ value: d.key, label: offerStatusLabel(d.key, t, statuses), color: offerStatusColor(d.key, statuses) }));
  const key = String(current ?? "").trim();
  if (key && !options.some((o) => o.value === key))
    options.push({ value: key, label: offerStatusLabel(key, t, statuses), color: offerStatusColor(key, statuses) });
  return options;
};

/** The offers' win rate: won / (won + lost), over offers that reached a verdict. */
export const offerWinStats = (
  offers: readonly { status?: string | null }[],
  statuses: readonly OfferStatusDef[] = DEFAULT_OFFER_STATUS_DEFS,
): { won: number; decided: number; winRate: number } => {
  let won = 0;
  let decided = 0;
  for (const o of offers) {
    const group = offerStatusGroup(o.status, statuses);
    if (group === "won") {
      won++;
      decided++;
    } else if (group === "lost") {
      decided++;
    }
  }
  return { won, decided, winRate: decided > 0 ? Math.round((won / decided) * 100) : 0 };
};
