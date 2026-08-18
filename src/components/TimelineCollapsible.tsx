import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

/**
 * Collapsed height, in pixels, shared by every entry of every timeline.
 *
 * The number is the point of the component: notes, mails, call logs and
 * proposals used to clip at different heights (or not at all), so a long
 * note pushed the rest of the history off screen while a mail of the same
 * length stayed a neat card. One constant keeps the timeline scannable.
 */
export const TIMELINE_COLLAPSED_HEIGHT = 220;

interface TimelineCollapsibleProps {
  /** Whether the caller currently holds this entry open. */
  isExpanded: boolean;
  /** Flip the expanded state for this entry. */
  onToggle: () => void;
  language: Language;
  /** Override only when a card genuinely needs a different clip height. */
  collapsedHeight?: number;
  /**
   * Tailwind gradient stops of the fade over the clipped edge. They have to
   * match the card background, otherwise the fade shows as a grey band.
   */
  fadeClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Height-limited wrapper for one timeline entry's body.
 *
 * Whether an entry is clipped is decided from its measured height rather than
 * from a character count: the body can be plain text, parsed note blocks, an
 * audio player or a status change, and only the rendered result says whether
 * anything is actually hidden. Entries that fit are left completely alone —
 * no toggle, no fade, no wrapper height.
 *
 * Expanding works from the button and from a double-click anywhere in the
 * body, since that is the reflex when a wall of text is cut off.
 */
export const TimelineCollapsible = ({
  isExpanded,
  onToggle,
  language,
  collapsedHeight = TIMELINE_COLLAPSED_HEIGHT,
  fadeClassName = "from-white via-white/70",
  className = "",
  children,
}: TimelineCollapsibleProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Re-measure on every content change and on reflow (window resize, a font or
  // an audio player settling in), so the toggle never lingers on an entry that
  // no longer overflows — or goes missing on one that started to.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  const overflows = contentHeight > collapsedHeight + 4;
  const isClipped = overflows && !isExpanded;

  const handleDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!overflows) return;
    // Links, audio controls and checkboxes have their own double-click
    // meaning; only plain body text acts as the expand surface.
    if ((e.target as HTMLElement).closest("a, button, input, textarea, audio, summary")) return;
    e.stopPropagation();
    // The gesture would otherwise leave a word highlighted under the fade.
    window.getSelection()?.removeAllRanges();
    onToggle();
  };

  return (
    <div className={className}>
      <div
        onDoubleClick={handleDoubleClick}
        className={`relative ${overflows ? "overflow-hidden transition-[max-height] duration-300 ease-in-out" : ""}`}
        style={
          overflows
            ? { maxHeight: isExpanded ? contentHeight + 24 : collapsedHeight }
            : undefined
        }
      >
        <div ref={contentRef}>{children}</div>
        {isClipped && (
          <div
            className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t to-transparent ${fadeClassName}`}
          />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          title={getTranslation(language, "timeline.expand_hint")}
          className="mt-1.5 mx-auto w-fit flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 active:scale-95 transition-all duration-200 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 stroke-[2.5]" />
              {getTranslation(language, "timeline.show_less")}
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 stroke-[2.5]" />
              {getTranslation(language, "timeline.show_more")}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default TimelineCollapsible;
