import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlignLeft } from "lucide-react";
import { TaskPillText, type MentionEntity } from "./TaskPillText";
import { viewSizeScale } from "../utils/viewSize";

/** Above the task drawer (z-[100000]) and the dropdown panels (100001). */
const POPOVER_Z = 100002;
const GAP = 8;
const WIDTH_BASE = 320;
/** A short grace so the pointer can travel from the mark onto the popover (to select text, follow a tag). */
const CLOSE_DELAY_MS = 120;

interface Props {
  /** The task's description; nothing renders without text. */
  description?: string | null;
  /** Spoken / tooltip-free label of the mark. */
  label: string;
  onTagClick?: (tag: string) => void;
  knownEntities?: MentionEntity[];
  className?: string;
}

/**
 * The "this task has a description" mark. Hover (or focus, or a tap) opens a popover with the
 * whole text, so a list row can stay one line tall and still give the description away.
 */
export const TaskDescriptionMark: React.FC<Props> = ({ description, label, onTagClick, knownEntities, className = "" }) => {
  const text = (description ?? "").trim();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);

  const cancelClose = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  const place = useCallback(() => {
    const el = markRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(WIDTH_BASE * viewSizeScale(), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    // Open on the roomier side, and never taller than that side.
    if (below >= 160 || below >= above) {
      setPos({ left, top: r.bottom + GAP, width, maxHeight: Math.max(96, below - GAP - 8) });
    } else {
      setPos({ left, bottom: window.innerHeight - r.top + GAP, width, maxHeight: Math.max(96, above - GAP - 8) });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!text) return null;

  return (
    <>
      {/* A span, not a button: in a task row the whole row is already a button, and buttons do not nest. */}
      <span
        ref={markRef}
        role="button"
        tabIndex={0}
        data-testid="task-description-mark"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }
        }}
        onClick={(e) => {
          // A tap is the only way to open it without a pointer; it must not also open the task.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex shrink-0 items-center justify-center rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 cursor-pointer ${className}`}
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </span>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            data-testid="task-description-popover"
            onMouseEnter={cancelClose}
            onMouseLeave={hideSoon}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, zIndex: POPOVER_Z }}
            className="overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-ui font-medium text-slate-700 shadow-xl ring-4 ring-slate-900/[0.03] whitespace-pre-wrap break-words"
          >
            <TaskPillText text={text} onTagClick={onTagClick} knownEntities={knownEntities} />
          </div>,
          document.body,
        )}
    </>
  );
};
