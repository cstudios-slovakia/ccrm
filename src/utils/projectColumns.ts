// The columns of the projects list, and how a project type arranges them.
//
// Kept apart from the view so the table head, the sort dropdown and the column
// editor in project type settings all read one catalogue and cannot drift — the
// two hand-written copies of the column list they replaced already had.

import type { ProjectAttribute, ProjectChecklistExtra, ProjectListColumn } from "../types";

/** A column that is always there, whatever the project type. */
export type BuiltinProjectColumnKey =
  | "name"
  | "type"
  | "client"
  | "managers"
  | "rating"
  | "deadline"
  | "progress"
  | "status";

/**
 * The built-in columns, in the order a type that has never been arranged shows
 * them — which is the order the list has always had.
 */
export const BUILTIN_PROJECT_COLUMNS: readonly BuiltinProjectColumnKey[] = [
  "name",
  "type",
  "client",
  "managers",
  "rating",
  "deadline",
  "progress",
  "status",
];

/**
 * The project's own name is what identifies the row and opens it, so it is the
 * one column that cannot be switched off or moved out of first place. Every
 * other column is free.
 */
export const LOCKED_PROJECT_COLUMN: BuiltinProjectColumnKey = "name";

/**
 * What each built-in column is called, as [en, sk, hu] — the words the table
 * head prints and the column editor lists. An attribute column is named by the
 * attribute itself, so it is not here.
 */
export const BUILTIN_COLUMN_LABELS: Record<BuiltinProjectColumnKey, [string, string, string]> = {
  name: ["Project", "Projekt", "Projekt"],
  type: ["Type", "Typ", "Típus"],
  client: ["Client", "Klient", "Ügyfél"],
  managers: ["Managers", "Manažéri", "Menedzserek"],
  rating: ["Rating", "Hodnotenie", "Értékelés"],
  deadline: ["Deadline", "Termín", "Határidő"],
  progress: ["Progress", "Postup", "Haladás"],
  status: ["Status", "Stav", "Állapot"],
};

const ATTRIBUTE_COLUMN_PREFIX = "attr:";

/** The column key that shows a given custom attribute. */
export const attributeColumnKey = (attributeId: string): string =>
  `${ATTRIBUTE_COLUMN_PREFIX}${attributeId}`;

/** The attribute a column key points at, or null when it is a built-in column. */
export function attributeIdFromColumnKey(key: string): string | null {
  if (!key.startsWith(ATTRIBUTE_COLUMN_PREFIX)) return null;
  const id = key.slice(ATTRIBUTE_COLUMN_PREFIX.length);
  return id ? id : null;
}

export const isAttributeColumnKey = (key: string): boolean =>
  attributeIdFromColumnKey(key) !== null;

const isBuiltinColumnKey = (key: string): key is BuiltinProjectColumnKey =>
  (BUILTIN_PROJECT_COLUMNS as readonly string[]).includes(key);

/** A column of the list with the attribute it shows already looked up. */
export interface ResolvedProjectColumn {
  key: string;
  visible: boolean;
  /** Set only for an attribute column — the attribute whose value the cell shows. */
  attribute?: ProjectAttribute;
}

/**
 * The type's columns as they stand today: its saved arrangement, reconciled
 * with the columns that actually exist.
 *
 * A saved layout is a record of decisions somebody made, and the attribute list
 * moves underneath it, so reconciling rather than trusting is the whole job:
 *
 * - A key that is neither a built-in nor one of `attributes` is dropped. That
 *   is a deleted attribute, and its column goes with it.
 * - A built-in missing from the layout is appended **visible**. It is new since
 *   the layout was saved, and a column nobody has ruled on should be shown.
 * - An attribute missing from the layout is appended **hidden**. Adding a field
 *   to a type must not silently widen everyone's table — an attribute becomes a
 *   column only when someone asks for it.
 * - {@link LOCKED_PROJECT_COLUMN} is forced first and visible, so the list can
 *   never end up with no way to tell one row from another.
 *
 * `saved` absent or empty means the type has never been arranged, which lands
 * on exactly the default: the built-ins visible, the attributes off.
 */
export function resolveProjectColumns(
  attributes: readonly ProjectAttribute[] | undefined,
  saved: readonly ProjectListColumn[] | undefined | null,
): ResolvedProjectColumn[] {
  const attrs = attributes ?? [];
  const byId = new Map(attrs.map(a => [a.id, a]));

  const out: ResolvedProjectColumn[] = [];
  const seen = new Set<string>();

  for (const entry of saved ?? []) {
    const key = entry?.key;
    if (typeof key !== "string" || seen.has(key)) continue;

    if (isBuiltinColumnKey(key)) {
      seen.add(key);
      out.push({ key, visible: entry.visible !== false });
      continue;
    }

    const attrId = attributeIdFromColumnKey(key);
    const attribute = attrId ? byId.get(attrId) : undefined;
    // An unknown key is a column that no longer exists — a deleted attribute,
    // or a built-in this version dropped. Either way it is not shown again.
    if (!attribute) continue;
    seen.add(key);
    out.push({ key, visible: entry.visible !== false, attribute });
  }

  for (const key of BUILTIN_PROJECT_COLUMNS) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: true });
  }

  for (const attribute of attrs) {
    const key = attributeColumnKey(attribute.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: false, attribute });
  }

  const lockedAt = out.findIndex(c => c.key === LOCKED_PROJECT_COLUMN);
  if (lockedAt > 0) out.unshift(...out.splice(lockedAt, 1));
  if (out.length > 0 && out[0].key === LOCKED_PROJECT_COLUMN) out[0].visible = true;

  return out;
}

/** Just the columns the list draws, in order. */
export function visibleProjectColumns(
  attributes: readonly ProjectAttribute[] | undefined,
  saved: readonly ProjectListColumn[] | undefined | null,
): ResolvedProjectColumn[] {
  return resolveProjectColumns(attributes, saved).filter(c => c.visible);
}

/** The resolved list trimmed back to what is worth storing on the project type. */
export function toStoredColumns(columns: readonly ResolvedProjectColumn[]): ProjectListColumn[] {
  return columns.map(({ key, visible }) => ({ key, visible }));
}

/**
 * Moves one column to sit before or after another, the way the drag in the
 * column editor reads. Returns the list unchanged when either end is unknown,
 * or when the move would push {@link LOCKED_PROJECT_COLUMN} out of first place.
 */
export function moveProjectColumn<T extends { key: string }>(
  columns: readonly T[],
  dragKey: string,
  targetKey: string,
  position: "before" | "after",
): T[] {
  const from = columns.findIndex(c => c.key === dragKey);
  const onto = columns.findIndex(c => c.key === targetKey);
  if (from === -1 || onto === -1 || dragKey === targetKey) return columns.slice();
  if (dragKey === LOCKED_PROJECT_COLUMN) return columns.slice();

  const next = columns.slice();
  const [moved] = next.splice(from, 1);
  // The target index shifts by one once the dragged row is lifted out from above it.
  const base = onto > from ? onto - 1 : onto;
  next.splice(position === "after" ? base + 1 : base, 0, moved);

  if (next[0]?.key !== LOCKED_PROJECT_COLUMN && columns[0]?.key === LOCKED_PROJECT_COLUMN) {
    return columns.slice();
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Attribute values, as a narrow table cell needs them                         */
/* -------------------------------------------------------------------------- */

/**
 * A list attribute ("files", or a "checkbox" with options) as it comes back
 * from the server.
 *
 * `project.data` is handed over as raw text — unlike timeline attributes,
 * sync.php does not decode it — so the same value is an array in local state
 * and its JSON source after a round trip. Both are read here.
 */
export function asAttributeList(rawVal: unknown): any[] {
  if (Array.isArray(rawVal)) return rawVal;
  if (typeof rawVal === "string" && rawVal.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(rawVal);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** True for a checkbox attribute that is a plain yes/no rather than a set of options. */
export const isBooleanCheckbox = (attr: ProjectAttribute): boolean =>
  attr.type === "checkbox" && (!attr.options || attr.options.length === 0);

/** A checkbox-with-options value: the ticked labels, plus the boxes this project added itself. */
export interface ChecklistValue {
  checked: string[];
  extra: ProjectChecklistExtra[];
}

/**
 * Reads a checkbox-with-options value in either of its stored shapes.
 *
 * The plain shape — and the only one before projects could add their own boxes
 * — is the array of ticked labels. A project that added boxes stores
 * `{ checked, extra }` instead. Either may arrive as its JSON text after a
 * round trip (see asAttributeList).
 */
export function readChecklistValue(rawVal: unknown): ChecklistValue {
  let raw = rawVal;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as { checked?: unknown; extra?: unknown };
    const extra = (Array.isArray(obj.extra) ? obj.extra : [])
      .filter((e: any) => e && typeof e.label === "string" && e.label.trim())
      .map((e: any) => ({ label: String(e.label), required: !!e.required }));
    return { checked: asAttributeList(obj.checked).map(String), extra };
  }
  return { checked: asAttributeList(raw).map(String), extra: [] };
}

/**
 * The inverse of readChecklistValue. Without extras it writes the plain array,
 * so a project that never added a box keeps the shape every other reader knows.
 */
export function writeChecklistValue(value: ChecklistValue): string[] | ChecklistValue {
  return value.extra.length === 0 ? value.checked : { checked: value.checked, extra: value.extra };
}

/** The required boxes — the type's own and the project's — that are not ticked yet. */
export function missingChecklistItems(attr: ProjectAttribute, rawVal: unknown): string[] {
  if (attr.type !== "checkbox" || isBooleanCheckbox(attr)) return [];
  const { checked, extra } = readChecklistValue(rawVal);
  const options = attr.options || [];
  const required = [
    ...(attr.requiredOptions || []).filter(o => options.includes(o)),
    ...extra.filter(e => e.required).map(e => e.label),
  ];
  return [...new Set(required)].filter(label => !checked.includes(label));
}

/**
 * What sorting an attribute column compares — a number where the attribute is
 * one, text otherwise, and null for "no value", which always sorts last.
 *
 * `contactName` resolves a contact attribute's stored lead id; sorting by a
 * column of names has to compare the names, not the ids behind them.
 */
export function projectAttributeSortValue(
  attr: ProjectAttribute,
  rawVal: unknown,
  ctx: { moneyAmount: (raw: unknown) => number | null; contactName: (id: string) => string | null },
): string | number | null {
  switch (attr.type) {
    case "money":
      return ctx.moneyAmount(rawVal);
    case "number": {
      if (rawVal === "" || rawVal === null || rawVal === undefined) return null;
      const n = Number(String(rawVal).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox": {
      // A yes/no box is never empty: "no" is an answer, and sorts below "yes".
      if (isBooleanCheckbox(attr)) return rawVal ? 1 : 0;
      const picked = readChecklistValue(rawVal).checked;
      return picked.length === 0 ? null : picked.join(", ");
    }
    case "files": {
      const files = asAttributeList(rawVal);
      return files.length === 0 ? null : files.length;
    }
    case "contact": {
      const name = typeof rawVal === "string" && rawVal ? ctx.contactName(rawVal) : null;
      return name || null;
    }
    default: {
      // Dates, times and datetimes are stored ISO-first, so text order is time order.
      if (rawVal === "" || rawVal === null || rawVal === undefined) return null;
      return String(rawVal);
    }
  }
}
