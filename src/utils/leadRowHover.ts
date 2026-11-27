import type { CSSProperties } from "react";

/**
 * Row hover in the leads list, without React.
 *
 * One lead is up to three table rows (the lead, its stage strip, its summary),
 * and hovering any of them highlights all three and opens the strip. That used
 * to be React state on the list, so every hover in and out re-rendered the whole
 * list: 350-560 ms of script on a 500-row list. The hover is now an attribute on
 * the rows and everything it changes is CSS (`.lead-hover-*` in index.css).
 */
const HOVER_ATTR = "data-lead-hover";

/** Marks or unmarks every adjacent row of the same lead (rows carry `data-lead-id`). */
export function markLeadHover(row: HTMLElement, on: boolean): void {
  const id = row.dataset.leadId;
  if (id == null) return;
  row.toggleAttribute(HOVER_ATTR, on);
  for (let n = row.previousElementSibling; n instanceof HTMLElement && n.dataset.leadId === id; n = n.previousElementSibling) {
    n.toggleAttribute(HOVER_ATTR, on);
  }
  for (let n = row.nextElementSibling; n instanceof HTMLElement && n.dataset.leadId === id; n = n.nextElementSibling) {
    n.toggleAttribute(HOVER_ATTR, on);
  }
}

/** The resting and hovered background of a `.lead-hover-row` / `.lead-hover-actions` element. */
export function leadHoverVars(rest: string, hover: string): CSSProperties {
  return { "--lead-bg": rest, "--lead-bg-hover": hover } as CSSProperties;
}
