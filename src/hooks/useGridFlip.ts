import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

export interface FlipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DURATION = 260;
const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/**
 * Animates a CSS grid that rearranges itself.
 *
 * Grid placement is not animatable — a card handed a new column span or a new
 * position in the list simply appears somewhere else on the next frame. This is
 * the usual FLIP answer: after the browser has laid the new board out, measure
 * where everything ended up, transform each card back to where it just was, and
 * release the transform on the next frame so it slides into its new slot. A
 * card that also changed *size* is scaled the same way and its contents are
 * given the inverse scale, so the card grows without the text inside it
 * stretching.
 *
 * Measurements use `offsetLeft`/`offsetTop`, which — unlike a bounding rect —
 * ignore the transforms an interrupted animation may still be applying, so
 * rearranging mid-flight stays correct.
 *
 * Cards opt in with `data-flip="<id>"`; a card that is being dragged around by
 * hand opts back out with `data-flip-skip`, since its position is not the
 * grid's business while the pointer owns it.
 */
export function useGridFlip(
  containerRef: RefObject<HTMLElement | null>,
  signature: string,
  enabled: boolean
) {
  const previous = useRef<Map<string, FlipRect>>(new Map());
  const lastSignature = useRef(signature);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Hand a card a starting rect it can animate out of — where a drop let go. */
  const seed = useCallback((id: string, rect: FlipRect) => {
    previous.current.set(id, rect);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const changed = lastSignature.current !== signature;
    lastSignature.current = signature;

    if (!container || !enabled) {
      previous.current = new Map();
      return;
    }

    // Someone who has asked for less motion still needs the board to be
    // usable; they just get the new layout outright instead of a glide.
    const stillness = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>(":scope > [data-flip]:not([data-flip-skip])")
    );

    const next = new Map<string, FlipRect>();
    const moves: { node: HTMLElement; dx: number; dy: number; sx: number; sy: number }[] = [];

    for (const node of nodes) {
      const id = node.dataset.flip;
      if (!id) continue;
      const rect: FlipRect = {
        x: node.offsetLeft,
        y: node.offsetTop,
        w: node.offsetWidth,
        h: node.offsetHeight
      };
      next.set(id, rect);
      if (!changed) continue;

      const before = previous.current.get(id);
      if (!before || !before.w || !before.h || !rect.w || !rect.h) continue;
      if (before.x === rect.x && before.y === rect.y && before.w === rect.w && before.h === rect.h) continue;

      moves.push({
        node,
        dx: before.x - rect.x,
        dy: before.y - rect.y,
        sx: before.w / rect.w,
        sy: before.h / rect.h
      });
    }

    previous.current = next;
    if (!moves.length || stillness) return;

    for (const move of moves) {
      const inner = move.node.firstElementChild as HTMLElement | null;
      const id = move.node.dataset.flip as string;
      const running = timers.current.get(id);
      if (running) clearTimeout(running);

      move.node.style.transition = "none";
      move.node.style.transformOrigin = "top left";
      move.node.style.willChange = "transform";
      // Readable from outside for as long as the card is in motion: the QA
      // suite has no other way to tell a glide from a jump.
      move.node.dataset.flipAnimating = "";
      move.node.style.transform =
        `translate3d(${move.dx}px, ${move.dy}px, 0) scale(${move.sx}, ${move.sy})`;
      if (inner) {
        inner.style.transition = "none";
        inner.style.transformOrigin = "top left";
        inner.style.transform = `scale(${1 / move.sx}, ${1 / move.sy})`;
      }
    }

    // Read a layout value so the inverted transforms above are the browser's
    // starting point rather than being collapsed into the frame that follows.
    void container.offsetWidth;

    requestAnimationFrame(() => {
      for (const move of moves) {
        const inner = move.node.firstElementChild as HTMLElement | null;
        const id = move.node.dataset.flip as string;

        move.node.style.transition = `transform ${DURATION}ms ${EASING}`;
        move.node.style.transform = "";
        if (inner) {
          inner.style.transition = `transform ${DURATION}ms ${EASING}`;
          inner.style.transform = "";
        }

        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            move.node.style.transition = "";
            move.node.style.transformOrigin = "";
            move.node.style.willChange = "";
            delete move.node.dataset.flipAnimating;
            if (inner) {
              inner.style.transition = "";
              inner.style.transformOrigin = "";
            }
          }, DURATION + 60)
        );
      }
    });
  });

  useLayoutEffect(() => {
    const running = timers.current;
    return () => {
      running.forEach(clearTimeout);
      running.clear();
    };
  }, []);

  return { seed };
}
