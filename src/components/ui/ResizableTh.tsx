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

const POSITIONED = /(^|\s)(sticky|relative|absolute|fixed)(\s|$)/;
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
  const { getWidth, setWidth, seedWidths, resetWidth, hasWidths } = useColumnWidths(listKey);
  const width = getWidth(colKey);

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

  return (
    <th
      {...rest}
      ref={ref}
      data-col-key={colKey}
      className={`${className ?? ""}${className && POSITIONED.test(className) ? "" : " relative"}`}
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
        onReset={() => {
          if (ref.current) setW(ref.current, "");
          resetWidth(colKey);
        }}
      />
    </th>
  );
}
