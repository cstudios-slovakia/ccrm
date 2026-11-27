import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { clampColumnWidth } from "../../utils/columnWidths";
import { getStoredLanguage } from "../../utils/translations";

const label = () => {
  const l = getStoredLanguage();
  return l === "sk" ? "Zmeniť šírku stĺpca" : l === "hu" ? "Oszlopszélesség módosítása" : "Resize column";
};

const hint = () => {
  const l = getStoredLanguage();
  return l === "sk"
    ? "Potiahnutím zmeníte šírku, dvojklikom ju prispôsobíte obsahu"
    : l === "hu"
      ? "Húzással átméretezheti, dupla kattintással a tartalomhoz igazítja"
      : "Drag to resize, double-click to fit the content";
};

interface Props {
  /** Current rendered width of the header cell. */
  getWidth: () => number;
  /** Fires once when a drag or key press begins, before the first change. */
  onStart: () => void;
  /** Live width while dragging (DOM only, no persistence). */
  onLive: (w: number) => void;
  /** Final width; persists it. */
  onCommit: (w: number) => void;
  onReset: () => void;
}

/**
 * Thin drag handle on the right edge of a <th>, drawn as a faint short line so people can see it is
 * there (darker on hover). Double-clicking it fits the column to its content.
 * Must sit inside a positioned header cell.
 */
export function ColumnResizeHandle({ getWidth, onStart, onLive, onCommit, onReset }: Props) {
  const drag = useRef<{ x: number; w: number; last: number } | null>(null);
  const lastDown = useRef(0);

  // A double press is detected here, not with onDoubleClick: the press captures the pointer, and in a
  // sticky table head the visible handle is a copy that hands the press to this one, so the browser's
  // dblclick lands on neither handle.
  const down = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastDown.current < 400) {
      lastDown.current = 0;
      drag.current = null;
      onReset();
      return;
    }
    lastDown.current = now;
    e.currentTarget.setPointerCapture(e.pointerId);
    onStart();
    const w = getWidth();
    drag.current = { x: e.clientX, w, last: w };
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    d.last = clampColumnWidth(d.w + e.clientX - d.x);
    onLive(d.last);
  };
  const up = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit(d.last);
  };
  const key = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    onStart();
    onCommit(clampColumnWidth(getWidth() + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 40 : 10)));
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label()}
      title={hint()}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="group/resize absolute inset-y-0 right-0 z-30 flex w-2 cursor-col-resize touch-none select-none items-stretch justify-center py-2.5 outline-none"
    >
      <span className="w-px rounded-full bg-slate-300/60 transition-colors duration-150 group-hover/resize:bg-slate-400 group-focus-visible/resize:bg-indigo-500 group-active/resize:bg-indigo-500" />
    </span>
  );
}
