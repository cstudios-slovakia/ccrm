/** Colour helpers shared by the colour picker and anything that stores a hex colour. */

/** Swatches offered by the colour picker: two rows of vivid 500s, one of deeper tones and neutrals. */
export const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#b45309", "#15803d", "#0369a1", "#4338ca", "#7e22ce", "#64748b", "#334155",
] as const;

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
