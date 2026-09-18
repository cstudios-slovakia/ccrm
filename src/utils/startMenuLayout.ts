/**
 * The Start Menu launcher layout: which groups exist, what sits in each of
 * them, and what the user hid.
 *
 * This used to live in `localStorage` under
 * `ccrm_start_menu_groups_v2_<user id>`. That key is the tell — whoever wrote it
 * knew the layout was per user, and put it in the one home that cannot deliver
 * that: the arrangement survived a reload, was gone on the same person's second
 * machine, and was gone again whenever the browser cleared site data. Inside the
 * very same feature, the default landing page and the sidebar nav layout were
 * already stored in the user's row.
 *
 * It now travels in `users.metadata_json.preferences.startMenuLayout` — see
 * `startMenuLayout` in utils/userPrefs.ts. No backend change was needed:
 * metadata_json is an opaque blob that sync.php passes through untouched.
 *
 * This module holds the shape, the normaliser that guards it, and the one-shot
 * read of the browser copy an existing install still has.
 */

export interface StartMenuGroup {
  id: string;
  name: string;
  iconName?: string;
  color?: string;
  isCustom?: boolean;
}

export interface StartMenuLayout {
  /** Column order, left to right. Empty means "never renamed or reordered". */
  groups: StartMenuGroup[];
  /** group id -> tile ids, in the order the user dropped them. */
  groupItems: Record<string, string[]>;
  /** Tiles dragged into "Unused / Hidden". */
  unused: string[];
}

const asStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id.length > 0) : [];

const normalizeGroup = (raw: unknown): StartMenuGroup | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) return null;
  const group: StartMenuGroup = {
    id: source.id,
    name: typeof source.name === "string" ? source.name : source.id,
  };
  if (typeof source.iconName === "string") group.iconName = source.iconName;
  if (typeof source.color === "string") group.color = source.color;
  if (source.isCustom === true) group.isCustom = true;
  return group;
};

/**
 * Coerce whatever the row (or an older browser's stored blob) hands over into
 * the shape above, and answer `null` for "this user has never customised the
 * launcher" — which is not the same as a layout that happens to be empty, and
 * is what tells the component to fall back to the built-in groups in the
 * current interface language.
 */
export function normalizeStartMenuLayout(raw: unknown): StartMenuLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;

  const groups = Array.isArray(source.groups)
    ? source.groups.map(normalizeGroup).filter((g): g is StartMenuGroup => g !== null)
    : [];

  const groupItems: Record<string, string[]> = {};
  const inboundItems = source.groupItems;
  if (inboundItems && typeof inboundItems === "object" && !Array.isArray(inboundItems)) {
    for (const [groupId, ids] of Object.entries(inboundItems as Record<string, unknown>)) {
      const items = asStringArray(ids);
      if (items.length > 0) groupItems[groupId] = items;
    }
  }

  const unused = asStringArray(source.unused);

  if (groups.length === 0 && Object.keys(groupItems).length === 0 && unused.length === 0) {
    return null;
  }
  return { groups, groupItems, unused };
}

/* ------------------------------------------------- one-shot local migration */

/** The per-browser key this layout used to live under, namespaced by user. */
const legacyKey = (userId?: string | null): string =>
  `ccrm_start_menu_groups_v2_${userId || "guest"}`;

const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    // iOS Safari with "Block All Cookies" throws on a plain read.
    return null;
  }
};

/**
 * The layout this browser still holds for the signed-in user, so moving the
 * storage does not throw away an arrangement they already made. Returns null
 * when there is nothing to adopt — the answer for everyone who never touched
 * the launcher.
 */
export function readLegacyStartMenuLayout(userId?: string | null): StartMenuLayout | null {
  const raw = readLocal(legacyKey(userId));
  if (!raw) return null;
  try {
    return normalizeStartMenuLayout(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

/**
 * Drop this browser's copies once the row holds the layout, so the migration
 * cannot fire twice.
 *
 * Only this user's key and the anonymous one: another account's key is still
 * that person's only copy until they sign in here themselves.
 */
export function clearLegacyStartMenuLayout(userId?: string | null): void {
  [legacyKey(userId), legacyKey(null)].forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* nothing we can do, and nothing that should stop the app */
    }
  });
}
