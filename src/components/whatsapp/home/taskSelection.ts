/** Which tasks are ticked in the Tasks tab's select mode. Pure, so the rules are tested without a browser. */

export function toggleSelected(selected: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(selected);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function selectAll(ids: readonly string[], on: boolean): Set<string> {
  return on ? new Set(ids) : new Set();
}
