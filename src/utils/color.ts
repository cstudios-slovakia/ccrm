/** Colour helpers shared by the colour picker and anything that stores a hex colour. */

/** Swatches offered by the colour picker: two rows of vivid 500s, one of deeper tones and neutrals. */
export const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#b45309", "#15803d", "#0369a1", "#4338ca", "#7e22ce", "#64748b", "#334155",
] as const;

/**
 * Curated palette of discreet, muted, and sophisticated tones.
 * Ideal for leave/absence types, project tags, and executive badges where
 * neon or overly saturated primary colors would be jarring.
 */
export const DISCREET_COLOR_PRESETS = [
  // Row 1: Warm Gold, Amber, Terracotta, Coral & Earth tones
  "#c29b62", "#b58b4c", "#d4a373", "#e0a96d", "#c86d51", "#d9826c", "#a67c52", "#8c6239",
  // Row 2: Soft Rose, Blush, Mauve, Vintage Purple & Plum tones
  "#f28482", "#b5757d", "#c08497", "#9e6b75", "#826a9b", "#7b6d8d", "#6d597a", "#5c5065",
  // Row 3: Olive, Sage, Eucalyptus, Forest, Slate Ocean & Charcoal tones
  "#789262", "#8da399", "#52796f", "#3d8b7a", "#4a7c9f", "#5c6b9c", "#64748b", "#475569",
] as const;

/**
 * The next discreet colour for a newly created item: the first discreet preset none of `used` has,
 * else the one used least.
 */
export function nextDiscreetColor(used: readonly (string | null | undefined)[]): string {
  const counts = new Map<string, number>();
  used.forEach((color) => {
    const hex = normalizeHex(color);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  });
  let best: string = DISCREET_COLOR_PRESETS[0];
  let bestCount = Infinity;
  for (const hex of DISCREET_COLOR_PRESETS) {
    const count = counts.get(hex) ?? 0;
    if (count < bestCount) {
      best = hex;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The order new main categories are coloured in — all picker presets, sequenced
 * so neighbours differ in hue, which keeps the first few categories distinct.
 */
export const AUTO_CATEGORY_COLORS = [
  "#3b82f6", "#f97316", "#10b981", "#ec4899", "#8b5cf6", "#eab308", "#06b6d4", "#ef4444",
  "#84cc16", "#6366f1", "#f59e0b", "#14b8a6", "#d946ef", "#0ea5e9", "#22c55e", "#a855f7", "#f43f5e",
] as const;

/**
 * The colour for a new main category: the first auto colour none of `used` has,
 * else the one used least, so every new category gets a colour of its own.
 */
export function nextCategoryColor(used: readonly (string | null | undefined)[]): string {
  const counts = new Map<string, number>();
  used.forEach((color) => {
    const hex = normalizeHex(color);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  });
  let best: string = AUTO_CATEGORY_COLORS[0];
  let bestCount = Infinity;
  for (const hex of AUTO_CATEGORY_COLORS) {
    const count = counts.get(hex) ?? 0;
    if (count < bestCount) {
      best = hex;
      bestCount = count;
    }
  }
  return best;
}

/** The colour a tree node shows: its own, else the nearest ancestor's. Null when none has one. */
export function inheritedColor<T extends { id: string; parentId?: string | null; color?: string | null }>(
  nodes: readonly T[],
  id: string | null | undefined
): string | null {
  const seen = new Set<string>();
  let current = id ? nodes.find((n) => n.id === id) : undefined;
  while (current && !seen.has(current.id)) {
    if (current.color) return current.color;
    seen.add(current.id);
    const parentId = current.parentId;
    current = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  }
  return null;
}

/**
 * `#rrggbb` in lower case, or null when the input is not a hex colour.
 * Accepts a missing `#` and the 3-digit shorthand, so typed input normalises too.
 */
export function normalizeHex(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw.split("").map((c) => c + c).join("")}`;
  return null;
}

/** True when dark ink reads better than white on top of `hex` (WCAG relative luminance). */
export function prefersDarkInk(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(normalized.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against white equals contrast against black at L ≈ 0.179.
  return luminance > 0.179;
}
