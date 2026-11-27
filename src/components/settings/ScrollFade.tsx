import React from "react";
import { cn } from "../../utils/cn";

/**
 * A scroll area with no visible scrollbar that still tells you there is more.
 *
 * The native bar is hidden (it is the always-on strip that made the old mobile
 * settings look unfinished); instead the content fades out on every edge that has
 * more behind it, and the item cut off by the fade shows where the list goes on.
 * The fade is driven by a `data-fade` attribute set straight on the element, so
 * scrolling never re-renders anything. A list that fits shows no fade at all.
 * See `scroll-fade-x` / `scroll-fade-y` in index.css.
 */
export const ScrollFade: React.FC<{
  axis: "x" | "y";
  className?: string;
  children: React.ReactNode;
  /** Gives the parent the scroller itself, e.g. to scroll the active item into view. */
  innerRef?: React.MutableRefObject<HTMLDivElement | null>;
  role?: string;
  "aria-label"?: string;
  id?: string;
}> = ({ axis, className, children, innerRef, ...rest }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);

  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      if (innerRef) innerRef.current = el;
    },
    [innerRef],
  );

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
      const size = axis === "x" ? el.scrollWidth : el.scrollHeight;
      const view = axis === "x" ? el.clientWidth : el.clientHeight;
      const value = [pos > 2 ? "start" : "", pos < size - view - 2 ? "end" : ""].filter(Boolean).join(" ");
      if (value) el.setAttribute("data-fade", value);
      else el.removeAttribute("data-fade");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resize?.observe(el);
    // The children change size without the scroller doing so (a chip added, a section shown).
    const mutate = typeof MutationObserver !== "undefined" ? new MutationObserver(update) : null;
    mutate?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize?.disconnect();
      mutate?.disconnect();
    };
  }, [axis]);

  return (
    <div
      ref={setRefs}
      className={cn(axis === "x" ? "scroll-fade-x overflow-x-auto" : "scroll-fade-y overflow-y-auto", className)}
      {...rest}
    >
      {children}
    </div>
  );
};
