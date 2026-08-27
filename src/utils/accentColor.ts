/**
 * Configured colours that have to stay readable in both appearances.
 *
 * Pipeline states, lead sources and project managers each carry a colour picked
 * by an administrator — against a white screen, because that is the only screen
 * that existed when they picked it. Rendered as *text* on a dark surface those
 * same colours (a #1d4ed8 blue, a #4f46e5 indigo) drop to around 2.5:1 and stop
 * being legible.
 *
 * The palette inversion in index.css cannot help here: these values arrive from
 * the database as inline styles, not as Tailwind classes, so there is no
 * variable to redefine.
 *
 * `liftAccent` wraps the colour in a `color-mix()` against two CSS variables
 * that the theme controls. In light mode the mix amount is 0%, so the value is
 * returned untouched and nothing about the current screens changes. In dark
 * mode it is mixed towards white until it reads on a dark card — in OKLab, so
 * the hue the administrator chose survives and only the lightness moves.
 */

/** Rejects values that would make the whole declaration invalid — an empty
 *  string, or anything carrying a `)` that could unbalance the function. */
const isUsableColor = (color: string): boolean =>
  typeof color === "string" && color.trim().length > 0 && !color.includes(")") && !color.includes(";");

/**
 * The same colour in light mode, a lifted version of it in dark mode.
 * Use for `color` (and for borders that have to stay visible); leave the faint
 * `${color}15` background tints alone, they read correctly either way.
 */
export const liftAccent = (color: string | undefined | null): string => {
  if (!color || !isUsableColor(color)) return color || "";
  return `color-mix(in oklab, ${color}, var(--accent-lift-color) var(--accent-lift-amount))`;
};

/**
 * Black or white, whichever can actually be read on `background`.
 *
 * Configured colours are also used the other way round — as a solid badge fill
 * with a fixed white label on top. That works for the deep blues it was chosen
 * with and fails for anything lighter: white on a #0ea5e9 sky blue is 2.8:1, in
 * light mode as much as in dark. Picking the foreground from the fill fixes
 * both appearances at once.
 */
/** Near-black rather than pure black: it matches the app's darkest ink. */
const INK = "#0b1220";
const PAPER = "#ffffff";

const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (a: number, b: number): number => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

export const readableOn = (background: string | undefined | null, fallback = PAPER): string => {
  const rgb = parseCssColor(background);
  if (!rgb) return fallback;
  // Measured rather than thresholded, so the choice is right by construction
  // instead of right until someone changes INK.
  const fill = relativeLuminance(rgb);
  const onInk = contrastRatio(fill, relativeLuminance(parseCssColor(INK)!));
  const onPaper = contrastRatio(fill, relativeLuminance(parseCssColor(PAPER)!));
  return onInk > onPaper ? INK : PAPER;
};

/** `#rgb`, `#rrggbb`, `#rrggbbaa` and `rgb()/rgba()`. Anything else gives null. */
const parseCssColor = (color: string | undefined | null): [number, number, number] | null => {
  if (!color) return null;
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1];
    const expand = digits.length === 3 || digits.length === 4
      ? digits.slice(0, 3).split("").map((c) => c + c).join("")
      : digits.slice(0, 6);
    if (expand.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(expand.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    return [parts[0], parts[1], parts[2]];
  }
  return null;
};
