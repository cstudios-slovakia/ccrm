import type { ProjectAttribute } from "../types";
import type { DropPosition } from "./reorder.ts";
import { moveRelative } from "./reorder.ts";
import {
  attributeColumnKey,
  attributeIdFromColumnKey,
  isAttributeColumnKey,
} from "./projectColumns.ts";

export { attributeColumnKey, attributeIdFromColumnKey, isAttributeColumnKey };

export type BuiltinLeadColumnKey =
  | "client"
  | "created"
  | "city"
  | "type"
  | "source"
  | "pm"
  | "value"
  | "state"
  | "division";

export const BUILTIN_LEAD_COLUMNS: readonly BuiltinLeadColumnKey[] = [
  "client",
  "created",
  "city",
  "type",
  "source",
  "pm",
  "value",
  "state",
  "division",
];

/**
 * Built-ins that are offered but start switched off — they widen the table, so
 * they appear only when someone asks for them (same shape as the projects list).
 */
export const DEFAULT_HIDDEN_LEAD_COLUMNS: readonly BuiltinLeadColumnKey[] = ["division"];

const defaultVisible = (key: BuiltinLeadColumnKey): boolean => !DEFAULT_HIDDEN_LEAD_COLUMNS.includes(key);

export const LOCKED_LEAD_COLUMN: BuiltinLeadColumnKey = "client";

export const BUILTIN_LEAD_COLUMN_LABELS: Record<BuiltinLeadColumnKey, [string, string, string]> = {
  client: ["Client", "Klient", "Ügyfél"],
  created: ["Date Created", "Dátum vytvorenia", "Létrehozás dátuma"],
  city: ["City", "Mesto", "Város"],
  type: ["Client Type", "Typ klienta", "Ügyfél típusa"],
  source: ["Source", "Zdroj", "Forrás"],
  pm: ["Project Manager", "Projektový Manažér", "Projektmenedzser"],
  value: ["Value", "Hodnota", "Érték"],
  state: ["State", "Stav", "Állapot"],
  division: ["Division", "Divízia", "Divízió"],
};

export interface StoredLeadColumn {
  key: string;
  visible: boolean;
}

export interface ResolvedLeadColumn {
  key: string;
  visible: boolean;
  /** Set only for an `attr:<id>` column — the Lead custom field it displays. */
  attribute?: ProjectAttribute;
}

export type LeadSortKey =
  | "state"
  | "pm"
  | "created"
  | "size"
  | "client"
  | "rating"
  | `attr:${string}`;

export interface LeadSort {
  key: LeadSortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_LEAD_SORT: LeadSort = {
  key: "state",
  direction: "asc",
};

const isBuiltinLeadColumnKey = (key: string): key is BuiltinLeadColumnKey =>
  (BUILTIN_LEAD_COLUMNS as readonly string[]).includes(key);

export function resolveLeadColumns(
  stored?: readonly StoredLeadColumn[] | null,
  attributes?: readonly ProjectAttribute[] | null,
): ResolvedLeadColumn[] {
  const attrs = attributes ?? [];
  const byId = new Map(attrs.map(a => [a.id, a]));

  const resolved: ResolvedLeadColumn[] = [];
  const seen = new Set<string>();

  for (const item of stored ?? []) {
    const key = item?.key;
    if (typeof key !== "string" || seen.has(key)) continue;

    if (isBuiltinLeadColumnKey(key)) {
      seen.add(key);
      resolved.push({
        key,
        visible: key === LOCKED_LEAD_COLUMN ? true : item.visible !== false,
      });
      continue;
    }

    const attrId = attributeIdFromColumnKey(key);
    const attribute = attrId ? byId.get(attrId) : undefined;
    // Drop keys for deleted custom fields cleanly.
    if (!attribute) continue;
    seen.add(key);
    resolved.push({
      key,
      visible: item.visible !== false,
      attribute,
    });
  }

  for (const key of BUILTIN_LEAD_COLUMNS) {
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({
      key,
      visible: defaultVisible(key),
    });
  }

  // Newly added custom fields append hidden so the table never widens without opt-in.
  for (const attribute of attrs) {
    const key = attributeColumnKey(attribute.id);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({
      key,
      visible: false,
      attribute,
    });
  }

  const lockedIdx = resolved.findIndex(c => c.key === LOCKED_LEAD_COLUMN);
  if (lockedIdx > 0) {
    const [locked] = resolved.splice(lockedIdx, 1);
    resolved.unshift({ ...locked, visible: true });
  } else if (lockedIdx === 0) {
    resolved[0].visible = true;
  }

  return resolved;
}

export function toStoredLeadColumns(columns: readonly ResolvedLeadColumn[]): StoredLeadColumn[] {
  return columns.map(c => ({
    key: c.key,
    visible: c.visible,
  }));
}

export function moveLeadColumn<T extends { key: string }>(
  columns: readonly T[],
  dragKey: string,
  targetKey: string,
  position: DropPosition,
): T[] {
  if (dragKey === LOCKED_LEAD_COLUMN || targetKey === LOCKED_LEAD_COLUMN) {
    return columns.slice();
  }
  return moveRelative(columns, c => c.key, dragKey, targetKey, position);
}
