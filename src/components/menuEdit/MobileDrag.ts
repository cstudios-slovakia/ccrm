import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pointer-event drag reorder for the mobile editor (HTML5 DnD does not work on
 * touch). Rows carry `data-mrow="<itemId>"`, each group section `data-mgroup="<groupId>"`
 * inside the scroll container. The drag starts after 4px of movement.
 */
export interface MobileDragState {
  id: string;
  /** Pointer clientY and the offset of the pointer inside the grabbed row. */
  y: number;
  grab: number;
  target: { groupId: string; index: number } | null;
}

export function useMobileDrag(
  scrollRef: React.RefObject<HTMLElement | null>,
  onInsert: (itemId: string, groupId: string, index: number) => void
) {
  const [drag, setDrag] = useState<MobileDragState | null>(null);
  const live = useRef<MobileDragState | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const insertRef = useRef(onInsert);
  insertRef.current = onInsert;

  const targetAt = useCallback(
    (id: string, y: number) => {
      const root = scrollRef.current;
      if (!root) return null;
      const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-mgroup]"));
      let chosen: HTMLElement | null = null;
      for (const sec of sections) {
        chosen = sec;
        if (y < sec.getBoundingClientRect().bottom) break;
      }
      if (!chosen) return null;
      const rows = Array.from(chosen.querySelectorAll<HTMLElement>("[data-mrow]")).filter((r) => r.dataset.mrow !== id);
      let index = 0;
      for (const r of rows) {
        const b = r.getBoundingClientRect();
        if (b.top + b.height / 2 < y) index++;
      }
      return { groupId: chosen.dataset.mgroup as string, index };
    },
    [scrollRef]
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cleanup.current?.();
      const row = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-mrow]");
      const grab = row ? e.clientY - row.getBoundingClientRect().top : 26;
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      let raf = 0;

      const update = (y: number) => {
        const next = { id, y, grab, target: targetAt(id, y) };
        live.current = next;
        setDrag(next);
      };
      const tick = () => {
        const cur = live.current;
        const sc = scrollRef.current;
        if (cur && sc) {
          const r = sc.getBoundingClientRect();
          const edge = 64;
          let v = 0;
          if (cur.y < r.top + edge) v = -((r.top + edge - cur.y) / edge) * 14;
          else if (cur.y > r.bottom - edge) v = ((cur.y - (r.bottom - edge)) / edge) * 14;
          if (v) {
            sc.scrollTop += v;
            update(cur.y);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      const stop = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", abort);
        window.removeEventListener("keydown", key);
        live.current = null;
        cleanup.current = null;
        setDrag(null);
      };
      const move = (ev: PointerEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
          started = true;
          raf = requestAnimationFrame(tick);
        }
        ev.preventDefault();
        update(ev.clientY);
      };
      const up = () => {
        const t = live.current?.target;
        stop();
        if (started && t) insertRef.current(id, t.groupId, t.index);
      };
      const abort = () => stop();
      const key = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          stop();
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", abort);
      window.addEventListener("keydown", key);
      cleanup.current = stop;
    },
    [scrollRef, targetAt]
  );

  useEffect(() => () => cleanup.current?.(), []);
  return { drag, startDrag };
}
