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

/** `#dashboard` and `#tasks` render the same view; remounting on that swap is a no-op that races open drawers. */
export function workspaceResetKey(hash: string): string {
  const route = parseAppHash(hash).route;
  return route === "tasks" ? "dashboard" : route;
}
