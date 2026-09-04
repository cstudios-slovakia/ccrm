/**
 * App routes live in the URL hash (`#client-Silvia?tab=timeline`).
 * Sub-views append `?tab=` (and similar) query strings; callers that extract
 * an entity id from the raw hash must strip the query first, otherwise the
 * lookup becomes `Silvia?tab=timeline` and the view renders an error screen.
 */
export function parseAppHash(hash: string): { route: string; params: URLSearchParams } {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const q = raw.indexOf("?");
  if (q === -1) return { route: raw, params: new URLSearchParams() };
  return {
    route: raw.slice(0, q),
    params: new URLSearchParams(raw.slice(q + 1)),
  };
}

/**
 * Key that clears the workspace error boundary when the view changes.
 *
 * Plainly the route. `#dashboard` used to be an alias of `#tasks` and was
 * folded into one key; they are now separate views (the widget dashboard and
 * the task panel), so each gets its own.
 */
export function workspaceResetKey(hash: string): string {
  return parseAppHash(hash).route;
}
