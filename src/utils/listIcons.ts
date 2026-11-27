import { LIST_ICON_GROUPS } from "./listIconCatalog.generated.ts";

/**
 * Small pictures in front of list labels: a Slovak or Hungarian flag on a lead source
 * ("web .sk" vs "web .hu"), a hammer on a division, and so on.
 *
 * Stored as ONE system setting, `LIST_ICONS`, written through `api/list_icons.php`
 * (never through the big settings push in sync.php):
 *
 *   { "leadSources": { "web .sk - cp": "flag-slovakia" }, "offerCategories": { "oc-12": "hammer" } }
 *
 * The three name lists (lead sources, divisions, interest categories) are keyed by the
 * item's name, trimmed and lower-cased — the same names the leads carry, so any view
 * that shows a name can show its icon. A rename moves the entry (renameListIcon). The
 * two category trees are keyed by category id, which never changes.
 *
 * The pictures are Twemoji SVGs in public/list-icons.svg (scripts/list-icons/). They
 * are not emoji characters, because Windows draws a flag emoji as two letters.
 */

export const LIST_ICON_KINDS = [
  "leadSources",
  "divisions",
  "leadCategories",
  "offerCategories",
  "financialCategories",
] as const;

export type ListIconKind = (typeof LIST_ICON_KINDS)[number];

export type ListIconMap = Partial<Record<ListIconKind, Record<string, string>>>;

const KNOWN_ICONS: ReadonlySet<string> = new Set(LIST_ICON_GROUPS.flatMap((g) => [...g.icons]));

export const isListIconKind = (value: unknown): value is ListIconKind =>
  typeof value === "string" && (LIST_ICON_KINDS as readonly string[]).includes(value);

export const isKnownListIcon = (id: unknown): id is string => typeof id === "string" && KNOWN_ICONS.has(id);

/** The key an item is stored under: names are case- and space-insensitive, ids are kept as they are. */
export function listIconKey(kind: ListIconKind, key: string | null | undefined): string {
  const raw = (key ?? "").trim();
  return kind === "offerCategories" || kind === "financialCategories" ? raw : raw.toLowerCase();
}

/** The icon id for an item, or null. An id the sprite does not have (an older build) counts as none. */
export function listIconFor(map: ListIconMap, kind: ListIconKind, key: string | null | undefined): string | null {
  const k = listIconKey(kind, key);
  if (!k) return null;
  const id = map[kind]?.[k];
  return isKnownListIcon(id) ? id : null;
}

/** A copy of `map` with the item's icon set, or removed when `icon` is null. */
export function setListIcon(map: ListIconMap, kind: ListIconKind, key: string, icon: string | null): ListIconMap {
  const k = listIconKey(kind, key);
  if (!k) return map;
  const current = map[kind] ?? {};
  if (icon === null) {
    if (!(k in current)) return map;
    const next = { ...current };
    delete next[k];
    return { ...map, [kind]: next };
  }
  if (current[k] === icon) return map;
  return { ...map, [kind]: { ...current, [k]: icon } };
}

/** A copy of `map` with the icon moved from one name to another (a renamed list item). */
export function renameListIcon(map: ListIconMap, kind: ListIconKind, from: string, to: string): ListIconMap {
  const a = listIconKey(kind, from);
  const b = listIconKey(kind, to);
  const current = map[kind];
  if (!a || !b || a === b || !current || !(a in current)) return map;
  const next = { ...current, [b]: current[a] };
  delete next[a];
  return { ...map, [kind]: next };
}

/** Whatever the server sent, reduced to the shape above. Unknown kinds and non-string values are dropped. */
export function normalizeListIconMap(raw: unknown): ListIconMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ListIconMap = {};
  for (const [kind, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!isListIconKind(kind) || !entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    const clean: Record<string, string> = {};
    for (const [key, id] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof id === "string" && id) clean[key] = id;
    }
    out[kind] = clean;
  }
  return out;
}
