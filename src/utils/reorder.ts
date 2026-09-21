// The one "drop it before / after that one" move behind every drag-to-reorder
// list in the app, so a row lands in the same place whichever list it is in.

/** Which edge of the row under the pointer the dragged row will land on. */
export type DropPosition = "before" | "after";

/**
 * Moves the item keyed `dragKey` to sit before or after the one keyed
 * `targetKey`. Returns an unchanged copy when either end is unknown or both are
 * the same item. Never mutates `items`.
 */
export function moveRelative<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  dragKey: string,
  targetKey: string,
  position: DropPosition,
): T[] {
  const from = items.findIndex(i => keyOf(i) === dragKey);
  const onto = items.findIndex(i => keyOf(i) === targetKey);
  if (from === -1 || onto === -1 || dragKey === targetKey) return items.slice();

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  // The target index shifts by one once the dragged row is lifted out from above it.
  const base = onto > from ? onto - 1 : onto;
  next.splice(position === "after" ? base + 1 : base, 0, moved);
  return next;
}
