import type { DropPosition } from "./reorder.ts";
import { moveRelative } from "./reorder.ts";

export type BuiltinLeadColumnKey =
  | "client"
  | "created"
  | "city"
  | "type"
  | "source"
  | "pm"
  | "value"
  | "state";

export const BUILTIN_LEAD_COLUMNS: readonly BuiltinLeadColumnKey[] = [
  "client",
  "created",
  "city",
  "type",
  "source",
  "pm",
  "value",
  "state",
];

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
};

export interface StoredLeadColumn {
  key: string;
  visible: boolean;
}

export interface ResolvedLeadColumn {
  key: BuiltinLeadColumnKey;
  visible: boolean;
}

export type LeadSortKey = "state" | "pm" | "created" | "size" | "client" | "rating";

export interface LeadSort {
  key: LeadSortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_LEAD_SORT: LeadSort = {
  key: "state",
  direction: "asc",
};

export function resolveLeadColumns(
  stored?: readonly StoredLeadColumn[] | null,
): ResolvedLeadColumn[] {
  if (!stored || stored.length === 0) {
    return BUILTIN_LEAD_COLUMNS.map(key => ({
      key,
      visible: true,
    }));
  }

  const seen = new Set<string>();
  const resolved: ResolvedLeadColumn[] = [];

  for (const item of stored) {
    if (BUILTIN_LEAD_COLUMNS.includes(item.key as BuiltinLeadColumnKey)) {
      const key = item.key as BuiltinLeadColumnKey;
      seen.add(key);
      resolved.push({
        key,
        visible: key === LOCKED_LEAD_COLUMN ? true : !!item.visible,
      });
    }
  }

  // Ensure any missing builtin columns are appended with default visibility
  for (const key of BUILTIN_LEAD_COLUMNS) {
    if (!seen.has(key)) {
      resolved.push({
        key,
        visible: true,
      });
    }
  }

  // Ensure locked column is first
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

export function moveLeadColumn(
  columns: readonly ResolvedLeadColumn[],
  dragKey: string,
  targetKey: string,
  position: DropPosition,
): ResolvedLeadColumn[] {
  if (dragKey === LOCKED_LEAD_COLUMN || targetKey === LOCKED_LEAD_COLUMN) {
    return columns.slice();
  }
  return moveRelative(columns, c => c.key, dragKey, targetKey, position);
}
