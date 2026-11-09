/**
 * Focus handling after text editing ends. When the editor is removed from the DOM while it
 * holds the focus (Escape, a click on another block), the browser drops the focus on <body>
 * and the builder root stops receiving Delete / Escape / Ctrl+Z. The root takes the focus
 * back, but only when it is lost: if the user clicked into another field (a panel input,
 * the link popover) that element is the active one and is left alone. Pure.
 */

/** True when nothing useful holds the focus: no active element, <body> or <html>. */
export const focusIsLost = (active: unknown, body: unknown, html: unknown): boolean =>
  active === null || active === undefined || active === body || active === html;

/**
 * What to do when a text editing session has just ended: true when the builder root should
 * take the focus. `wasEditing` / `isEditing` are the editing state before and after.
 */
export const shouldRefocusRoot = (wasEditing: boolean, isEditing: boolean, active: unknown, body: unknown, html: unknown): boolean =>
  wasEditing && !isEditing && focusIsLost(active, body, html);
