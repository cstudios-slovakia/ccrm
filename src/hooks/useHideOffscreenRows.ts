import { useEffect } from "react";

/** Set on a table row that is far outside the visible part of the page (index.css hides it). */
export const OFFSCREEN_ROW_ATTR = "data-offscreen-row";

/** How far beyond the visible area a row is still painted, so scrolling never shows a blank row. */
const KEEP_PAINTED_MARGIN_PX = 900;

/** The nearest ancestor that scrolls the page vertically (`main.workspace`), or null for the viewport. */
function verticalScroller(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Stops the browser painting the rows of a long list table that are far off screen.
 *
 * Every frame the browser draws costs time in proportion to everything painted on
 * the page, on screen or not. A leads list with a few hundred rows made each frame
 * take 200-400 ms, so a hover, the stage strip growing under a row or any small
 * animation elsewhere on the page stuttered. Measured on a 524-row list: a row
 * hover drew 6 frames in 0.9 s before and about 20 with the far rows unpainted.
 *
 * The rows stay in the document with `visibility: hidden`, so they keep their
 * size: the table's layout, the page height and the scroll position do not change,
 * and nothing has to be measured or re-created while scrolling. A row is painted
 * again before it comes within 900 px of the visible area.
 *
 * `useStickyTableHead` calls this for its wrapper, so every page list table has it.
 */
export function useHideOffscreenRows(wrap: HTMLElement | null): void {
  useEffect(() => {
    if (!wrap || typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.removeAttribute(OFFSCREEN_ROW_ATTR);
          else entry.target.setAttribute(OFFSCREEN_ROW_ATTR, "");
        }
      },
      { root: verticalScroller(wrap), rootMargin: `${KEEP_PAINTED_MARGIN_PX}px 0px` },
    );

    const watched = new Set<Element>();
    const sync = () => {
      const rows = new Set<Element>(wrap.querySelectorAll("tbody > tr"));
      for (const row of watched) {
        if (rows.has(row)) continue;
        observer.unobserve(row);
        watched.delete(row);
      }
      for (const row of rows) {
        if (watched.has(row)) continue;
        observer.observe(row);
        watched.add(row);
      }
    };
    sync();

    // Rows come and go with filters, "show more" and every sync; pick them up once per frame.
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    });
    mutations.observe(wrap, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      for (const row of watched) row.removeAttribute(OFFSCREEN_ROW_ATTR);
    };
  }, [wrap]);
}
