/** Pure helpers for resizable list columns. Widths are px, kept per list and column. */
export const MIN_COLUMN_WIDTH = 56;
export const MAX_COLUMN_WIDTH = 800;

export type ColumnWidthMap = Record<string, Record<string, number>>;

export const clampColumnWidth = (width: number): number => {
  if (!Number.isFinite(width)) return MIN_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
};

/** Returns a new map with one column set (clamped). */
export const withColumnWidth = (map: ColumnWidthMap | undefined, listKey: string, colKey: string, width: number): ColumnWidthMap => ({
  ...(map || {}),
  [listKey]: { ...(map?.[listKey] || {}), [colKey]: clampColumnWidth(width) },
});

/** Sets several columns at once; existing entries win unless `overwrite`. */
export const withColumnWidths = (
  map: ColumnWidthMap | undefined,
  listKey: string,
  widths: Record<string, number>,
  overwrite = false
): ColumnWidthMap => {
  const current = map?.[listKey] || {};
  const next = { ...current };
  for (const [k, w] of Object.entries(widths)) {
    if (overwrite || next[k] === undefined) next[k] = clampColumnWidth(w);
  }
  return { ...(map || {}), [listKey]: next };
};

/** Removes one column's width, or the whole list's when `colKey` is omitted. Empty lists are dropped. */
export const withoutColumnWidth = (map: ColumnWidthMap | undefined, listKey: string, colKey?: string): ColumnWidthMap => {
  const next = { ...(map || {}) };
  if (colKey === undefined) {
    delete next[listKey];
    return next;
  }
  const list = { ...(next[listKey] || {}) };
  delete list[colKey];
  if (Object.keys(list).length === 0) delete next[listKey];
  else next[listKey] = list;
  return next;
};
