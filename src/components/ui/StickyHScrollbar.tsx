import React, { useEffect, useRef, useState } from "react";

/**
 * A horizontal scrollbar that follows the viewport for a table wider than its card.
 *
 * The native bar sits under the last row, so on a long list it is only reachable
 * after scrolling the whole page to the end of the table. This renders a thin
 * proxy track directly after the scrolling wrapper, inside the same card, pinned
 * to the bottom edge of the page scroller (`main.workspace`) while the table runs
 * past the bottom of the screen. The two stay in sync both ways.
 *
 * (The offset is the workspace's own padding: sticky offsets are measured from the
 * scroller's content box, so `bottom-0` would float a gutter above the screen edge.)
 *
 * It appears only when it is needed: the wrapper really scrolls sideways AND its
 * own bar is out of view. When the native bar scrolls into view the proxy fades
 * out, so there are never two bars on screen. It takes no layout space (a negative
 * top margin tucks it over the wrapper's last pixels, where it is hidden anyway),
 * so showing and hiding never shifts the page.
 *
 * Like a page-sticky table head (see `table-page-sticky-head` in index.css) it
 * only works if no ancestor between it and `main.workspace` is a scroll container:
 * the card must use `overflow-clip`, not `overflow-hidden`.
 *
 * Place it as the next sibling of the scrolling wrapper:
 *
 *   const [wrapRef, wrapEl] = useStickyTableHead();
 *   <div ref={wrapRef} className="table-page-wrap"> <table/> </div>
 *   <StickyHScrollbar target={wrapEl} />
 *
 * It uses the app's thin rounded scrollbar (index.css), with the thumb drawn darker on
 * purpose: this bar exists to be found, and the usual pale thumb on a white strip reads
 * as an empty gap. (`!`: the global scrollbar rule is unlayered, so it beats utilities.)
 *
 * Not shown on touch screens, where swiping the table is the native gesture.
 */
interface StickyHScrollbarProps {
  /** The scrolling wrapper (the element from `useStickyTableHead`). */
  target: HTMLElement | null;
  className?: string;
}

/** Sub-pixel layout makes scrollLeft disagree by a fraction; do not ping-pong over it. */
const SCROLL_EPSILON = 1;

export const StickyHScrollbar: React.FC<StickyHScrollbarProps> = ({ target, className = "" }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);
  /** The wrapper's bottom edge (where its own bar is) is below the visible page. */
  const [barBelowFold, setBarBelowFold] = useState(false);

  // Does the wrapper scroll sideways, and how wide is what it scrolls?
  useEffect(() => {
    if (!target) return;
    const observed = new Set<Element>();
    const measure = () => {
      // `overflow-visible` at ws-lg: content may be wider than the box, but there
      // is nothing to scroll, so a proxy would be a dead bar.
      const scrolls = /auto|scroll/.test(getComputedStyle(target).overflowX);
      setOverflows(scrolls && target.scrollWidth > target.clientWidth + SCROLL_EPSILON);
      setContentWidth(target.scrollWidth);
    };
    const ro = new ResizeObserver(measure);
    const watch = () => {
      ro.observe(target);
      for (const child of Array.from(target.children)) {
        if (!observed.has(child)) {
          observed.add(child);
          ro.observe(child);
        }
      }
    };
    watch();
    // A table that remounts (loading -> rows, a filter swapping the table) is a new
    // child the observer has not seen.
    const mo = new MutationObserver(() => {
      watch();
      measure();
    });
    mo.observe(target, { childList: true });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [target]);

  // Is the wrapper's bottom edge below the bottom of the page scroller?
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = sentinel.closest<HTMLElement>(".workspace");
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        const rootBottom = e.rootBounds ? e.rootBounds.bottom : window.innerHeight;
        setBarBelowFold(!e.isIntersecting && e.boundingClientRect.top >= rootBottom);
      },
      { root, threshold: [0, 1] },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  // Keep the proxy and the wrapper at the same scrollLeft, in both directions.
  useEffect(() => {
    const track = trackRef.current;
    if (!target || !track) return;
    const sync = (from: HTMLElement, to: HTMLElement) => () => {
      if (Math.abs(to.scrollLeft - from.scrollLeft) > SCROLL_EPSILON) to.scrollLeft = from.scrollLeft;
    };
    const fromTarget = sync(target, track);
    const fromTrack = sync(track, target);
    target.addEventListener("scroll", fromTarget, { passive: true });
    track.addEventListener("scroll", fromTrack, { passive: true });
    return () => {
      target.removeEventListener("scroll", fromTarget);
      track.removeEventListener("scroll", fromTrack);
    };
  }, [target, overflows]);

  // The spacer only gets its width after render; catch the track up to the wrapper.
  useEffect(() => {
    const track = trackRef.current;
    if (target && track && overflows) track.scrollLeft = target.scrollLeft;
  }, [target, contentWidth, overflows]);

  return (
    <>
      <div ref={sentinelRef} className="h-0" aria-hidden="true" />
      {overflows && (
        <div
          ref={trackRef}
          tabIndex={-1}
          aria-hidden="true"
          data-sticky-hscrollbar={barBelowFold ? "shown" : "hidden"}
          className={`sticky bottom-[calc(var(--gutter)*-1)] z-15 -mt-2 h-2 overflow-x-auto overflow-y-hidden border-t border-slate-100 bg-white [&::-webkit-scrollbar-thumb:hover]:bg-slate-400! [&::-webkit-scrollbar-thumb]:bg-slate-300! transition-opacity duration-150 pointer-coarse:hidden ${
            barBelowFold ? "opacity-100" : "pointer-events-none opacity-0"
          } ${className}`}
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
    </>
  );
};
