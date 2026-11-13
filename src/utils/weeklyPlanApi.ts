/**
 * Weekly Plan API client & pure board/reference helpers.
 *
 * Kept free of `.tsx` runtime imports so Node's `--experimental-strip-types`
 * test runner can import and unit-test every pure helper directly.
 */

export type WeeklyPlanEntityKind =
  | "user"
  | "employee"
  | "project"
  | "client"
  | "lead"
  | "ticket"
  | "task";

export interface WeeklyPlanEntity {
  id: string;
  name: string;
  type: WeeklyPlanEntityKind;
  detail?: string;
  subtitle?: string;
}

export interface WeeklyPlanRef {
  kind: "tag" | WeeklyPlanEntityKind;
  id: string;
  label: string;
}

export interface WeeklyPlanFilterChip extends WeeklyPlanRef {
  key: string;
  count: number;
}

export interface WeeklyPlanCard {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  position: number;
  completed: boolean;
  refs: WeeklyPlanRef[];
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WeeklyPlanDayNote {
  date: string; // YYYY-MM-DD
  note: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

const ENDPOINT = "/api/weekly_plan.php";
const ENTITY_BOUNDARY_AFTER = /[\s,;:!?)\]}\n]/;
const PRECEDING_IDENTIFIER_CHAR = /[a-zA-Z0-9_.\u00C0-\u024F\u1E00-\u1EFF]/;

const KIND_ORDER: Record<WeeklyPlanRef["kind"], number> = {
  project: 1,
  client: 2,
  lead: 3,
  user: 4,
  employee: 5,
  ticket: 6,
  task: 7,
  tag: 8,
};

/** Format a local Date as YYYY-MM-DD (never via UTC toISOString). */
export const formatIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Parse YYYY-MM-DD into a local noon Date to stay immune to DST midnight shifts. */
export const parseIsoDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
};

/** Add `days` calendar days to a local Date or YYYY-MM-DD string. */
export const addLocalDays = (base: Date | string, days: number): Date => {
  const d = typeof base === "string" ? parseIsoDate(base) : new Date(base.getTime());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/** Return local Monday (12:00) of the ISO week (Mon..Sun) containing `d`. */
export const getMondayOfWeek = (d: Date): Date => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  const day = copy.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
};

/** Return the ordered list of YYYY-MM-DD date strings for a week starting on `monday`. */
export const getWeekDates = (monday: Date, showWeekends: boolean): string[] => {
  const mon = getMondayOfWeek(monday);
  const count = showWeekends ? 7 : 5;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(formatIsoDate(addLocalDays(mon, i)));
  }
  return out;
};

/** ISO-8601 week number (1..53). */
export const getIsoWeekNumber = (d: Date): number => {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/** Stable lowercase filter key for a WeeklyPlanRef. */
export const weeklyPlanRefKey = (ref: Pick<WeeklyPlanRef, "kind" | "id" | "label">): string => {
  const identifier = (ref.kind === "tag" ? ref.label : ref.id || ref.label).trim().toLowerCase();
  return `${ref.kind}:${identifier}`;
};

/**
 * Extract all `#tag` and `@entity` references present in `content`.
 * Supports multi-word entity names (longest match first) and underscore-escaped forms.
 */
export const extractWeeklyPlanRefs = (
  content: string,
  entities: WeeklyPlanEntity[] = [],
  explicitRefs: WeeklyPlanRef[] = [],
): WeeklyPlanRef[] => {
  const byKey = new Map<string, WeeklyPlanRef>();
  const addRef = (ref: WeeklyPlanRef) => {
    const key = weeklyPlanRefKey(ref);
    if (!byKey.has(key)) {
      byKey.set(key, ref);
    }
  };

  if (!content) return [];

  const sortedEntities = [...entities]
    .filter((e) => Boolean(e.name && e.name.trim()))
    .sort((a, b) => b.name.trim().length - a.name.trim().length);

  let i = 0;
  while (i < content.length) {
    const ch = content[i];

    if (ch === "#") {
      const match = content.slice(i).match(/^#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+)/);
      if (match) {
        const tag = match[1].trim();
        if (tag) {
          addRef({ kind: "tag", id: tag.toLowerCase(), label: tag });
        }
        i += match[0].length;
        continue;
      }
    }

    if (ch === "@" && (i === 0 || !PRECEDING_IDENTIFIER_CHAR.test(content[i - 1]))) {
      const afterAt = content.slice(i + 1);
      const afterAtLower = afterAt.toLowerCase();

      let matchedEntity: WeeklyPlanEntity | undefined;
      let matchedLen = 0;

      for (const entity of sortedEntities) {
        const trimmedName = entity.name.trim();
        const nameLower = trimmedName.toLowerCase();
        const underscoreLower = nameLower.replace(/\s+/g, "_");

        if (afterAtLower.startsWith(nameLower)) {
          const nextChar = afterAt[trimmedName.length];
          if (nextChar === undefined || ENTITY_BOUNDARY_AFTER.test(nextChar)) {
            matchedEntity = entity;
            matchedLen = trimmedName.length;
            break;
          }
        } else if (underscoreLower !== nameLower && afterAtLower.startsWith(underscoreLower)) {
          const nextChar = afterAt[underscoreLower.length];
          if (nextChar === undefined || ENTITY_BOUNDARY_AFTER.test(nextChar)) {
            matchedEntity = entity;
            matchedLen = underscoreLower.length;
            break;
          }
        }
      }

      if (matchedEntity && matchedLen > 0) {
        addRef({
          kind: matchedEntity.type,
          id: matchedEntity.id,
          label: matchedEntity.name.trim(),
        });
        i += 1 + matchedLen;
        continue;
      }

      const fallbackMatch = content.slice(i).match(/^@([\w\u00C0-\u024F\u1E00-\u1EFF.-]+)/);
      if (fallbackMatch) {
        const rawName = fallbackMatch[1];
        const rawLower = rawName.toLowerCase();
        const found = entities.find(
          (e) =>
            e.name.trim().toLowerCase() === rawLower ||
            e.name.trim().toLowerCase().replace(/\s+/g, "_") === rawLower,
        );
        if (found) {
          addRef({ kind: found.type, id: found.id, label: found.name.trim() });
        } else {
          addRef({ kind: "user", id: rawName, label: rawName });
        }
        i += fallbackMatch[0].length;
        continue;
      }
    }

    i += 1;
  }

  // Keep any explicit refs whose @label is still literally present in content
  const lowerContent = content.toLowerCase();
  for (const ref of explicitRefs) {
    if (!ref || !ref.label) continue;
    const token = ref.kind === "tag" ? `#${ref.label}` : `@${ref.label}`;
    if (lowerContent.includes(token.toLowerCase())) {
      addRef(ref);
    }
  }

  return Array.from(byKey.values());
};

const resolvedCardRefs = (card: WeeklyPlanCard, entities: WeeklyPlanEntity[]): WeeklyPlanRef[] => {
  const fromContent = extractWeeklyPlanRefs(card.content, entities, card.refs || []);
  if (fromContent.length > 0) return fromContent;
  return Array.isArray(card.refs) ? card.refs : [];
};

/**
 * Collect deduplicated filter chips across all cards in the active week.
 */
export const collectWeekFilterChips = (
  cards: WeeklyPlanCard[],
  entities: WeeklyPlanEntity[] = [],
): WeeklyPlanFilterChip[] => {
  const chipMap = new Map<string, WeeklyPlanFilterChip>();

  for (const card of cards) {
    const refs = resolvedCardRefs(card, entities);
    const seenInCard = new Set<string>();
    for (const ref of refs) {
      const key = weeklyPlanRefKey(ref);
      if (seenInCard.has(key)) continue;
      seenInCard.add(key);

      const existing = chipMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        chipMap.set(key, { ...ref, key, count: 1 });
      }
    }
  }

  return Array.from(chipMap.values()).sort((a, b) => {
    const orderDiff = (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
};

/**
 * Returns `true` when no filters are active or when `card` contains at least one
 * reference matching `activeFilterKeys`. Non-matching cards are dimmed to 10% opacity.
 */
export const cardMatchesActiveFilters = (
  card: WeeklyPlanCard,
  activeFilterKeys: Set<string>,
  entities: WeeklyPlanEntity[] = [],
): boolean => {
  if (!activeFilterKeys || activeFilterKeys.size === 0) return true;
  const refs = resolvedCardRefs(card, entities);
  return refs.some((ref) => {
    const primaryKey = weeklyPlanRefKey(ref);
    const labelFallbackKey = `${ref.kind}:${ref.label.trim().toLowerCase()}`;
    return activeFilterKeys.has(primaryKey) || activeFilterKeys.has(labelFallbackKey);
  });
};

// ---------------------------------------------------------------------------
// REST API Helpers
// ---------------------------------------------------------------------------

const parseApiJson = async (res: Response): Promise<any> => {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON response
  }
  if (!res.ok) {
    throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
  }
  return body;
};

export async function fetchWeeklyPlan(
  from: string,
  to: string,
): Promise<{ cards: WeeklyPlanCard[]; notes: WeeklyPlanDayNote[] }> {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`${ENDPOINT}?${qs.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const data = await parseApiJson(res);
  return {
    cards: Array.isArray(data?.cards) ? data.cards : [],
    notes: Array.isArray(data?.notes) ? data.notes : [],
  };
}

export async function saveWeeklyPlanCard(input: {
  id?: string;
  date: string;
  content: string;
  position: number;
  completed?: boolean;
  refs?: WeeklyPlanRef[];
}): Promise<WeeklyPlanCard> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      action: "save_card",
      id: input.id || "",
      date: input.date,
      content: input.content,
      position: input.position,
      completed: Boolean(input.completed),
      refs: input.refs || [],
    }),
  });
  const data = await parseApiJson(res);
  return data.card;
}

export async function reorderWeeklyPlanCards(
  items: Array<{ id: string; date: string; position: number }>,
): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      action: "reorder_cards",
      items,
    }),
  });
  await parseApiJson(res);
}

export async function deleteWeeklyPlanCard(id: string): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      action: "delete_card",
      id,
    }),
  });
  await parseApiJson(res);
}

export async function saveWeeklyPlanDayNote(
  date: string,
  note: string,
): Promise<WeeklyPlanDayNote> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      action: "save_note",
      date,
      note,
    }),
  });
  const data = await parseApiJson(res);
  return {
    date: data?.date || date,
    note: data?.note ?? note,
  };
}
