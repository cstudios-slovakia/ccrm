import { useRef } from "react";
import { useUserPrefs } from "../utils/userPrefs";
import { withColumnWidth, withColumnWidths, withoutColumnWidth } from "../utils/columnWidths";
import type { ColumnWidthMap } from "../utils/columnWidths";

/** Stored column widths (px) of one list; a column without an entry keeps its auto layout. */
export function useColumnWidths(listKey: string) {
  const { prefs, setPref } = useUserPrefs();
  const widths = prefs.columnWidths?.[listKey];
  // Latest map, so two writes in one tick (seed, then set) build on each other.
  const latest = useRef<ColumnWidthMap>(prefs.columnWidths);
  latest.current = prefs.columnWidths;
  const write = (next: ColumnWidthMap) => {
    latest.current = next;
    setPref("columnWidths", next);
  };
  return {
    widths,
    getWidth: (colKey: string) => widths?.[colKey],
    setWidth: (colKey: string, w: number) => write(withColumnWidth(latest.current, listKey, colKey, w)),
    /** Stores several at once (a drag start snapshots the siblings); existing entries are kept. */
    seedWidths: (w: Record<string, number>) => write(withColumnWidths(latest.current, listKey, w)),
    resetWidth: (colKey: string) => write(withoutColumnWidth(latest.current, listKey, colKey)),
    resetAll: () => write(withoutColumnWidth(latest.current, listKey)),
    hasWidths: !!widths && Object.keys(widths).length > 0,
  };
}
