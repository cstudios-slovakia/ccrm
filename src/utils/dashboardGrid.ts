/**
 * Where every card on a dashboard actually lands.
 *
 * The board is a plain CSS grid: twelve columns, cards in list order, each one
 * as wide as its size. Nothing carries a coordinate — position is a consequence
 * of order plus width, and the browser works it out with its auto-placement
 * algorithm. That is fine until someone drags a card and wants to drop it into
 * the empty half of a row, because "the empty half of a row" is not something
 * the list can express. This module reproduces the browser's placement in
 * JavaScript so the editor can answer two questions it otherwise could not:
 * which cells are free, and which position in the list puts a card in them.
 *
 * Kept free of React and of `dashboardWidgets` so `node --test` can load it on
 * its own.
 */

import type { WidgetSize } from "./dashboardWidgets";

export const GRID_COLUMNS = 12;

/** The Tailwind breakpoints the card widths change at. */
export type GridBreakpoint = "base" | "md" | "lg";

/**
 * How many columns each size takes, per breakpoint — the numbers behind
 * `SPAN_CLASS` in the view. Below `lg` the board is one or two cards per row
 * with no room left over, so free-space drops only ever appear on a wide
 * screen; the smaller maps exist so the planner never disagrees with what is
 * on screen.
 */
const SPAN: Record<GridBreakpoint, Record<WidgetSize, number>> = {
  lg: { sm: 3, md: 4, lg: 8, full: 12 },
  md: { sm: 6, md: 6, lg: 12, full: 12 },
  base: { sm: 12, md: 12, lg: 12, full: 12 }
};

export const breakpointForWidth = (width: number): GridBreakpoint =>
  width >= 1024 ? "lg" : width >= 768 ? "md" : "base";

export const spanOf = (size: WidgetSize, breakpoint: GridBreakpoint): number =>
  SPAN[breakpoint][size] ?? GRID_COLUMNS;

export interface GridItem {
  id: string;
  size: WidgetSize;
  /** A card may claim two rows; only honoured at `lg`, matching `lg:row-span-2`. */
  rowSpan?: number;
}

export interface GridPlacement {
  id: string;
  row: number;
  col: number;
  span: number;
  rowSpan: number;
}

/** A run of empty cells a dragged card fits in, and the list index that fills it. */
export interface GridDropTarget {
  row: number;
  col: number;
  span: number;
  rowSpan: number;
  /** Splice the card in at this index and it lands on exactly these cells. */
  insertIndex: number;
}

const rowSpanOf = (item: GridItem, breakpoint: GridBreakpoint): number =>
  breakpoint === "lg" && Number(item.rowSpan) === 2 ? 2 : 1;

/**
 * CSS grid's sparse auto-placement, as the spec describes it: a cursor walks
 * forward through the cells and never goes back, so a hole left behind stays a
 * hole — which is why the top-right of a board can sit empty while cards pile
 * up below it.
 */
export function planGrid(items: GridItem[], breakpoint: GridBreakpoint = "lg"): GridPlacement[] {
  const grid: boolean[][] = [];
  const cells = (row: number): boolean[] => (grid[row] ||= new Array(GRID_COLUMNS).fill(false));

  const isFree = (row: number, col: number, span: number, rows: number): boolean => {
    if (col + span > GRID_COLUMNS) return false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < span; c++) if (cells(row + r)[col + c]) return false;
    }
    return true;
  };

  let row = 0;
  let col = 0;
  const placements: GridPlacement[] = [];

  for (const item of items) {
    const span = Math.min(spanOf(item.size, breakpoint), GRID_COLUMNS);
    const rows = rowSpanOf(item, breakpoint);

    while (true) {
      if (col + span > GRID_COLUMNS) {
        row++;
        col = 0;
      }
      if (isFree(row, col, span, rows)) break;
      col++;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < span; c++) cells(row + r)[col + c] = true;
    }
    placements.push({ id: item.id, row, col, span, rowSpan: rows });
    col += span;
  }

  return placements;
}

/** How many rows the placed cards occupy. */
export const rowCountOf = (placements: GridPlacement[]): number =>
  placements.reduce((rows, p) => Math.max(rows, p.row + p.rowSpan), 0);

const occupancyOf = (placements: GridPlacement[]): boolean[][] => {
  const grid: boolean[][] = [];
  for (const p of placements) {
    for (let r = 0; r < p.rowSpan; r++) {
      const cells = (grid[p.row + r] ||= new Array(GRID_COLUMNS).fill(false));
      for (let c = 0; c < p.span; c++) cells[p.col + c] = true;
    }
  }
  return grid;
};

const landsOnEmptyCells = (grid: boolean[][], p: GridPlacement): boolean => {
  for (let r = 0; r < p.rowSpan; r++) {
    const cells = grid[p.row + r];
    if (!cells) continue; // a row past the end of the board is empty by definition
    for (let c = 0; c < p.span; c++) if (cells[p.col + c]) return false;
  }
  return true;
};

/**
 * Every place the dragged card can be dropped without disturbing anything else.
 *
 * `rest` is the board with the dragged card already taken out of it, which is
 * what the user is looking at mid-drag. Each list position is tried in turn and
 * kept only when the card would land entirely on empty cells — that is exactly
 * the "it fits in the gap" test, and it rules out the positions that would
 * shove the rest of the board around (those stay the business of dropping onto
 * another card). Positions that land on the same cells collapse to the earliest
 * one, so each visible gap yields a single target.
 */
export function freeDropTargets(
  rest: GridItem[],
  dragged: GridItem,
  breakpoint: GridBreakpoint = "lg"
): GridDropTarget[] {
  const occupied = occupancyOf(planGrid(rest, breakpoint));
  const targets: GridDropTarget[] = [];
  const seen = new Set<string>();

  for (let index = 0; index <= rest.length; index++) {
    const candidate = [...rest.slice(0, index), dragged, ...rest.slice(index)];
    const placement = planGrid(candidate, breakpoint).find(p => p.id === dragged.id);
    if (!placement || !landsOnEmptyCells(occupied, placement)) continue;

    const key = `${placement.row}:${placement.col}`;
    if (seen.has(key)) continue;
    seen.add(key);

    targets.push({
      row: placement.row,
      col: placement.col,
      span: placement.span,
      rowSpan: placement.rowSpan,
      insertIndex: index
    });
  }

  return targets;
}

/** Splices `id` back into the list at `index`, counted on the list without it. */
export function insertAt<T extends { id: string }>(items: T[], id: string, index: number): T[] {
  const from = items.findIndex(item => item.id === id);
  if (from === -1) return items;
  const rest = [...items.slice(0, from), ...items.slice(from + 1)];
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), items[from], ...rest.slice(at)];
}
