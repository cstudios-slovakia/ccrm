/**
 * How the lead / client picker orders its list.
 *
 * Three sections, in this order:
 *   1. "recent" — what this user picked last, most recent first
 *   2. "newest" — the register by creation date, newest first
 *   3. "rest"   — the same records in the order the register already has
 *
 * The first two are paged (`CLIENT_PICKER_PAGE_SIZE` at a time). A record that
 * the newest section has already shown is hidden from the rest — see
 * `hideIfShownIn` on CustomSelect options — so expanding "newest" eats into the
 * rest instead of repeating it. A record in "recent" is in neither.
 */

export const CLIENT_PICKER_PAGE_SIZE = 10;
/** Picks remembered per user — far more than anyone pages through. */
export const RECENT_CLIENTS_LIMIT = 50;

interface Groupable {
  id: string;
  createdAt?: string | null;
}

const createdTime = (l: Groupable): number => {
  const raw = l.createdAt;
  if (!raw) return 0;
  const t = new Date(raw.replace(" ", "T")).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function splitClientsForPicker<T extends Groupable>(
  leads: T[],
  recentIds: readonly string[] | null | undefined,
): { recent: T[]; newest: T[]; rest: T[] } {
  const byId = new Map(leads.map((l) => [l.id, l] as const));
  const recent: T[] = [];
  const taken = new Set<string>();
  for (const id of recentIds ?? []) {
    const item = byId.get(id);
    if (!item || taken.has(id)) continue;
    taken.add(id);
    recent.push(item);
  }
  const rest = leads.filter((l) => !taken.has(l.id));
  // Stable sort: records without a date keep register order among themselves.
  const newest = [...rest].sort((a, b) => createdTime(b) - createdTime(a));
  return { recent, newest, rest };
}

/** Puts `id` first, drops a repeat, and caps the list. */
export function pushRecentClient(
  recentIds: readonly string[] | null | undefined,
  id: string,
  limit: number = RECENT_CLIENTS_LIMIT,
): string[] {
  const prev = recentIds ?? [];
  if (!id) return [...prev];
  return [id, ...prev.filter((x) => x !== id)].slice(0, limit);
}
