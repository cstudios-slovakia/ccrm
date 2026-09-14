import { useEffect, type RefObject } from "react";

const EDGE = 100;      // px from an edge where auto-scrolling kicks in
const MAX_SPEED = 24;  // px per frame right at the edge

/**
 * A native HTML5 drag does not scroll the app's own scroll container (<main>)
 * for us, so in a long list an item could never be dragged above the top edge
 * of the viewport — the rows scrolled off the top were unreachable as drop
 * targets. While `active`, nudge the nearest scrollable ancestor of `anchorRef`
 * whenever the pointer sits near one of its edges.
 */
export function useDragAutoScroll(active: boolean, anchorRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;

    const findScroller = (): HTMLElement => {
      let node = anchorRef.current?.parentElement || null;
      while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
        node = node.parentElement;
      }
      return (document.scrollingElement as HTMLElement) || document.documentElement;
    };

    const scroller = findScroller();
    const isPage = scroller === document.scrollingElement || scroller === document.documentElement;

    let pointerY: number | null = null;
    let frame = 0;

    const step = () => {
      frame = requestAnimationFrame(step);
      if (pointerY === null) return;
      const top = isPage ? 0 : scroller.getBoundingClientRect().top;
      const bottom = isPage ? window.innerHeight : scroller.getBoundingClientRect().bottom;
      const fromTop = pointerY - top;
      const fromBottom = bottom - pointerY;
      if (fromTop < EDGE) {
        scroller.scrollTop -= MAX_SPEED * (1 - Math.max(fromTop, 0) / EDGE);
      } else if (fromBottom < EDGE) {
        scroller.scrollTop += MAX_SPEED * (1 - Math.max(fromBottom, 0) / EDGE);
      }
    };

    const onDragOver = (e: DragEvent) => { pointerY = e.clientY; };
    window.addEventListener("dragover", onDragOver);
    frame = requestAnimationFrame(step);

    return () => {
      window.removeEventListener("dragover", onDragOver);
      cancelAnimationFrame(frame);
    };
  }, [active, anchorRef]);
}
