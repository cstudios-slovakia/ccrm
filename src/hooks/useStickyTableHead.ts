import { useLayoutEffect, useState } from "react";

/**
 * Keeps a list table's head pinned to the top of the page scroller
 * (`main.workspace`) whether or not the table fits its card.
 *
 * Give the scrolling wrapper `table-page-wrap` and the table's <thead>
 * `table-page-sticky-head` (index.css explains the CSS half). This hook decides
 * which mode the wrapper is in and sets `data-hscroll` on it:
 *
 * - `false` — the table fits. The wrapper turns `overflow: visible`, so no scroll
 *   container sits between the <th> and the page, and CSS `position: sticky` does
 *   the whole job.
 * - `true` — the table is wider than its card. The wrapper has to scroll sideways,
 *   which makes it a scroll container that CSS sticky cannot see past. So the hook
 *   puts a copy of the head right before the wrapper (`table-page-head-mirror`),
 *   outside that scroll container, where `position: sticky` binds to the page
 *   again. At rest the copy lies exactly over the real head; scrolled, it pins.
 *   The copy only follows the wrapper sideways, from a scroll listener.
 *
 *   Anything that moves the head per vertical scroll step lands at least a frame
 *   late on some machines (a scroll listener always; a scroll-driven animation
 *   whenever the browser keeps it off the compositor), and the head jumps. Only
 *   native sticky moves with the page in the same frame, so the copy exists.
 *
 *   The copy is plain DOM cloned from the real head, so it has no React handlers:
 *   a click on it is replayed on the matching element of the real head (a sort
 *   button, the select-all box), and every change to the real head re-clones it.
 *   It is `aria-hidden`; assistive tech and the keyboard use the real head.
 *
 * `StickyHScrollbar` is the other half of the wide-table mode: it keeps the
 * sideways scrollbar reachable.
 *
 * Returns `[ref, element]`: put `ref` on the wrapper and hand `element` to
 * `StickyHScrollbar`. A callback ref rather than a ref object, because the
 * wrapper mounts and unmounts with the view (list/board toggle, loading states)
 * and an effect keyed on a ref object would never see it appear.
 */
export function useStickyTableHead(): [(el: HTMLElement | null) => void, HTMLElement | null] {
  const [wrap, setWrap] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!wrap) return;
    let frame = 0;
    let stale = true;
    let mirror: HTMLDivElement | null = null;
    let copy: HTMLTableElement | null = null;

    const source = () => {
      const table = wrap.querySelector("table");
      return table?.tHead ? { table, head: table.tHead } : null;
    };

    /** The element at the same position under `to` as `el` is under `from`. */
    const counterpart = (el: Element, from: Element, to: Element): Element | null => {
      const path: number[] = [];
      for (let node: Element | null = el; node && node !== from; node = node.parentElement) {
        path.unshift(Array.prototype.indexOf.call(node.parentElement?.children ?? [], node));
      }
      let node: Element | undefined = to;
      for (const i of path) node = node?.children[i];
      return node ?? null;
    };

    const replayClick = (event: MouseEvent) => {
      const src = source();
      if (!copy || !src || !(event.target instanceof Element)) return;
      event.preventDefault();
      event.stopPropagation();
      // `dispatchEvent` rather than `.click()`: the target may be an <svg> icon
      // inside a button. A dispatched click still toggles a checkbox.
      counterpart(event.target, copy, src.table)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
      stale = true;
      schedule();
    };

    // Sideways wheel over the copy (which hides its own overflow) pans the table.
    const forwardWheel = (event: WheelEvent) => {
      const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (dx) wrap.scrollLeft += dx;
    };

    const syncScroll = () => {
      if (mirror && mirror.scrollLeft !== wrap.scrollLeft) mirror.scrollLeft = wrap.scrollLeft;
    };

    const removeMirror = () => {
      mirror?.remove();
      mirror = null;
      copy = null;
    };

    const clone = (table: HTMLTableElement, head: HTMLTableSectionElement) => {
      if (!mirror) {
        mirror = document.createElement("div");
        mirror.className = "table-page-head-mirror";
        mirror.setAttribute("aria-hidden", "true");
        mirror.addEventListener("click", replayClick);
        mirror.addEventListener("wheel", forwardWheel, { passive: true });
        mirror.append(document.createElement("div"));
      }
      if (mirror.nextElementSibling !== wrap) wrap.before(mirror);
      copy = table.cloneNode(false) as HTMLTableElement;
      const headCopy = head.cloneNode(true) as HTMLTableSectionElement;
      for (const el of Array.from(headCopy.querySelectorAll("[id]"))) el.removeAttribute("id");
      for (const el of Array.from(headCopy.querySelectorAll<HTMLElement>("button, a, input, select, textarea, [tabindex]"))) {
        el.tabIndex = -1;
      }
      // Cloning copies attributes, not live state such as a half-checked box.
      const inputs = head.querySelectorAll("input");
      headCopy.querySelectorAll("input").forEach((input, i) => {
        input.checked = inputs[i]?.checked ?? false;
        input.indeterminate = inputs[i]?.indeterminate ?? false;
      });
      copy.append(headCopy);
      mirror.firstElementChild!.replaceChildren(copy);
    };

    /** Lays the copy exactly over the real head: same size, same columns. */
    const place = (table: HTMLTableElement, head: HTMLTableSectionElement) => {
      if (!mirror || !copy) return;
      const height = head.offsetHeight;
      mirror.hidden = height === 0;
      if (!height) return;
      const track = mirror.firstElementChild as HTMLElement;
      const wrapBox = wrap.getBoundingClientRect();
      const tableBox = table.getBoundingClientRect();
      mirror.style.width = `${wrap.clientWidth}px`;
      mirror.style.height = `${height}px`;
      // Take no room: the wrapper keeps its place and the copy covers the head.
      const lead = head.getBoundingClientRect().top - wrapBox.top;
      mirror.style.marginLeft = "0px";
      mirror.style.marginTop = `${lead}px`;
      mirror.style.marginBottom = `${-(lead + height)}px`;
      const box = mirror.getBoundingClientRect();
      mirror.style.marginLeft = `${wrapBox.left + wrap.clientLeft - box.left}px`;
      // A flex or grid gap between the two would still push the wrapper down.
      const drift = head.getBoundingClientRect().top - box.top;
      if (Math.abs(drift) > 0.5) mirror.style.marginBottom = `${-(lead + height) - drift}px`;

      track.style.width = `${wrap.scrollWidth}px`;
      // Exactly as wide as its columns: a set width would be spread over them.
      copy.style.width = "max-content";
      copy.style.marginLeft = `${tableBox.left - wrapBox.left - wrap.clientLeft + wrap.scrollLeft}px`;
      syncScroll();
      const cells = Array.from(head.querySelectorAll("th, td")).map((c) => c.getBoundingClientRect());
      const copies = Array.from(copy.querySelectorAll<HTMLElement>("th, td"));
      copies.forEach((cell, i) => {
        cell.style.width = cell.style.minWidth = cell.style.maxWidth = `${cells[i]?.width ?? 0}px`;
      });
      // Collapsed outer borders can put the first cell a pixel or two in from
      // the table's edge; line the cells up rather than the tables.
      if (copies[0] && cells[0]) {
        const shift = cells[0].left - copies[0].getBoundingClientRect().left;
        copy.style.marginLeft = `${parseFloat(copy.style.marginLeft) + shift}px`;
      }
    };

    const update = () => {
      frame = 0;
      const src = source();
      if (!src || wrap.dataset.hscroll !== "true") {
        removeMirror();
        return;
      }
      if (stale || !mirror || !copy) {
        clone(src.table, src.head);
        stale = false;
        watchHead(src.head);
      }
      place(src.table, src.head);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const measure = () => {
      // `scrollWidth` reports the content's width even while `overflow` is
      // `visible`, so this reads the same in both modes and cannot flip-flop.
      const wide = wrap.scrollWidth > wrap.clientWidth + 1;
      const mode = wide ? "true" : "false";
      if (wrap.dataset.hscroll !== mode) wrap.dataset.hscroll = mode;
      schedule();
    };

    const watched = new Set<Element>();
    const ro = new ResizeObserver(measure);
    const watch = (els: Iterable<Element>) => {
      for (const el of els) {
        if (!watched.has(el)) {
          watched.add(el);
          ro.observe(el);
        }
      }
    };
    // Any change to the real head (a sort arrow, the select-all icon, the
    // language) is copied over. Column widths follow the rows, so each cell is
    // watched for size as well.
    const headMo = new MutationObserver(() => {
      stale = true;
      schedule();
    });
    let watchedHead: HTMLTableSectionElement | null = null;
    const watchHead = (head: HTMLTableSectionElement) => {
      watch(head.querySelectorAll("th, td"));
      if (watchedHead === head) return;
      headMo.disconnect();
      headMo.observe(head, { subtree: true, childList: true, attributes: true, characterData: true });
      watchedHead = head;
    };
    watch([wrap, ...Array.from(wrap.children)]);
    // The table can remount (rows arriving after a load, a filter swapping the
    // table out); a new child is a new thing to watch.
    const mo = new MutationObserver(() => {
      watch(Array.from(wrap.children));
      stale = true;
      measure();
    });
    mo.observe(wrap, { childList: true });

    // A checkbox's `checked` changes without touching the DOM; recopy after any
    // interaction with the table that might have flipped the select-all box.
    const onInteract = () => {
      stale = true;
      schedule();
    };
    wrap.addEventListener("change", onInteract);

    measure();
    wrap.addEventListener("scroll", syncScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      wrap.removeEventListener("scroll", syncScroll);
      wrap.removeEventListener("change", onInteract);
      ro.disconnect();
      mo.disconnect();
      headMo.disconnect();
      removeMirror();
      delete wrap.dataset.hscroll;
    };
  }, [wrap]);
  return [setWrap, wrap];
}
