import { useLayoutEffect, useRef } from "react";
import type { ThHTMLAttributes } from "react";
import { useColumnWidths } from "../../hooks/useColumnWidths";
import { clampColumnWidth } from "../../utils/columnWidths";
import { ColumnResizeHandle } from "./ColumnResizeHandle";

interface Props extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Which list's stored widths this header belongs to, e.g. "leads". */
  listKey: string;
  /** Column id within the list; also the key of the stored width. */
  colKey: string;
}

const setW = (el: HTMLElement, w: number | string) => {
  const v = typeof w === "number" ? `${w}px` : w;
  el.style.width = el.style.minWidth = el.style.maxWidth = v;
};

/**
 * A `<th>` whose right edge can be dragged. Until a width is stored the column
 * keeps its auto layout; the first drag stores the widths of its sibling
 * headers too (so nothing jumps) and switches the table to a fixed layout.
 * Cells then truncate (see `[data-col-resized]` in index.css).
 */
export function ResizableTh({ listKey, colKey, className, style, children, ...rest }: Props) {
  const ref = useRef<HTMLTableCellElement>(null);
  const { getWidth, setWidth, seedWidths, hasWidths } = useColumnWidths(listKey);
  const width = getWidth(colKey);

  // The handle needs a positioned cell. A sticky header (`.table-page-sticky-head th`) already is one, and
  // a `relative` class there would override its `position: sticky`: the head stops sticking and the sticky
  // head mirror covers it. So `relative` is set only on a cell that would otherwise be static.
  useLayoutEffect(() => {
    const th = ref.current;
    if (th && getComputedStyle(th).position === "static") th.style.position = "relative";
  }, []);

  useLayoutEffect(() => {
    const table = ref.current?.closest("table");
    if (!table) return;
    if (hasWidths) table.setAttribute("data-col-resized", "");
    else table.removeAttribute("data-col-resized");
  }, [hasWidths]);

  const start = () => {
    const th = ref.current;
    const row = th?.parentElement;
    if (!th || !row) return;
    const cells = Array.from(row.querySelectorAll<HTMLElement>("th[data-col-key]"));
    const seed: Record<string, number> = {};
    cells.forEach((el) => {
      if (el.dataset.colKey) seed[el.dataset.colKey] = el.offsetWidth;
    });
    // Fixed layout reads the widths from the first row, so apply them now.
    th.closest("table")?.setAttribute("data-col-resized", "");
    cells.forEach((el) => {
      if (!el.style.width && el.dataset.colKey) setW(el, clampColumnWidth(seed[el.dataset.colKey]));
    });
    seedWidths(seed);
  };

  // Double-click: fit the column to its widest content (header and every body / totals cell), like a
  // spreadsheet. Clearing the stored width alone did nothing visible: once one column was dragged, every
  // sibling has a stored width and the fixed layout hands the cleared column the leftover space.
  const autoFit = () => {
    const th = ref.current;
    const row = th?.parentElement as HTMLTableRowElement | null;
    const table = th?.closest("table");
    if (!th || !row || !table) return;
    start();
    const idx = th.cellIndex;
    const cells: HTMLElement[] = [th];
    table.querySelectorAll<HTMLTableRowElement>("tbody > tr, tfoot > tr").forEach((tr) => {
      const cell = tr.cells.length === row.cells.length ? tr.cells[idx] : undefined;
      if (cell && cell.colSpan === 1) cells.push(cell);
    });
    setW(th, "0px");
    const saved = cells.map((c) => c.style.whiteSpace);
    cells.forEach((c) => (c.style.whiteSpace = "nowrap"));
    const natural = Math.max(...cells.map((c) => c.scrollWidth));
    cells.forEach((c, i) => (c.style.whiteSpace = saved[i]));
    const fit = clampColumnWidth(natural + 4);
    setW(th, fit);
    setWidth(colKey, fit);
  };

  return (
    <th
      {...rest}
      ref={ref}
      data-col-key={colKey}
      className={className}
      style={width ? { ...style, width, minWidth: width, maxWidth: width } : style}
    >
      {children}
      <ColumnResizeHandle
        getWidth={() => ref.current?.offsetWidth ?? 0}
        onStart={start}
        onLive={(w) => ref.current && setW(ref.current, w)}
        onCommit={(w) => {
          if (ref.current) setW(ref.current, w);
          setWidth(colKey, w);
        }}
        onReset={autoFit}
      />
    </th>
  );
}
