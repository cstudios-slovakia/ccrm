/**
 * Dark mode for a light-first codebase, without touching 13 000 class names.
 *
 * THE PROBLEM
 * -----------
 * CCRM's markup does not use semantic colour tokens. It uses Tailwind's raw
 * palette directly: `bg-white`, `bg-slate-50`, `border-slate-200`,
 * `text-slate-800`, `bg-indigo-50 text-indigo-700`. There are ~13 000 of those
 * across 72 000 lines of TSX. Adding a `dark:` counterpart to each is not a
 * change anyone can review, and it rots the moment someone writes new markup.
 *
 * THE LEVER
 * ---------
 * Tailwind v4 does not inline colours. Every utility resolves a variable:
 *
 *     .bg-white       { background-color: var(--color-white) }
 *     .text-slate-800 { color: var(--color-slate-800) }
 *
 * So redefining `--color-slate-*` under `[data-theme="dark"]` re-themes every
 * one of those 13 000 usages at once. src/index.css does exactly that: the
 * neutral and tinted ends of each ramp are inverted, so the shades that carry
 * light surfaces become dark surfaces and the shades that carry dark text
 * become light text.
 *
 * WHY A PLUGIN IS STILL NEEDED
 * ----------------------------
 * One variable serves two opposite roles. `--color-indigo-600` is the text on
 * an `bg-indigo-50` badge (needs to get *lighter* in dark mode) and the fill of
 * a solid `bg-indigo-600 text-white` button (needs to stay *deep*, or white
 * text stops being legible on it). A variable cannot be both.
 *
 * The role is not in the variable — it is in the property the utility sets.
 * That is what this plugin keys on. After Tailwind has generated its CSS it
 * walks the utility rules and, for the combinations where the inverted ramp is
 * the wrong answer, clones the rule with the *original* colour pinned back in:
 *
 *   - a saturated shade (400-950) used as a BACKGROUND or gradient stop — solid
 *     buttons, badges, modal backdrops, dark code blocks. Already dark-on-white
 *     text; inverting it would turn them white.
 *   - a dark shade (700-950) used as a BORDER — the hairlines around those same
 *     dark surfaces.
 *   - a light shade (50-200) used as TEXT — the white-ish labels that sit on
 *     top of them.
 *   - `bg-white` and `border-white` in every alpha variant, which become the
 *     dark card surface and a faint light hairline rather than a dark-mode
 *     white slab. `text-white` is deliberately left alone: it is the label on
 *     every solid button and must stay white.
 *
 * Everything else rides the inverted variables and needs no rule here.
 *
 * WHY GENERATE RATHER THAN HAND-WRITE
 * -----------------------------------
 * The clone reuses Tailwind's own selector, so every variant — `hover:`,
 * `focus:`, `group-hover:`, `disabled:`, `peer-checked:after:`, responsive
 * prefixes — is handled without this file knowing that variants exist. And it
 * stays correct for markup written after today: a `bg-emerald-600` added next
 * month is covered the next time the CSS is built, with nothing to update.
 *
 * SPECIFICITY
 * -----------
 * The clone is wrapped in `:where(...)`, which contributes zero specificity,
 * and inserted immediately after the rule it overrides. So it beats exactly one
 * thing — its own base rule, on source order — and loses to every variant of
 * itself, which is what keeps `bg-white hover:bg-slate-50` hovering in dark
 * mode instead of freezing on the base colour.
 */

/**
 * The dark override, written as a *nested* rule inside the one it overrides.
 *
 * Prefixing the parent's selector instead (`:where(html[…]) .bg-white`) looked
 * simpler and was wrong: Tailwind emits its variants as nested rules, so the
 * declaration for `hover:bg-emerald-500` lives in a `&:hover` child of
 * `.hover\:bg-emerald-500`. Prefixing that child's relative selector dropped the
 * `&` — and with it the `:hover` — so the hover colour was painted at rest.
 *
 * Nesting keeps whatever context the parent is in (`:hover`, `::after`, a media
 * query, another nesting level) without this file having to know about any of
 * it. `:where()` still contributes no specificity, so the override beats only
 * the rule it is nested in, on source order.
 */
const DARK_SCOPE = '&:where(html[data-theme="dark"], html[data-theme="dark"] *)';

/** Properties that paint a surface. */
const SURFACE_PROPS = new Set([
  'background-color',
  'background',
  '--tw-gradient-from',
  '--tw-gradient-to',
  '--tw-gradient-via',
  // A coloured `shadow-indigo-600/30` etc. is the glow cast by a solid
  // `bg-indigo-600` button, not a text colour — it needs to stay a deep,
  // saturated colour in dark mode too. Left unpinned it rides the inverted
  // ramp like glyph text does, so a 600/900/950 shadow colour turns
  // near-white and the glow reads as a stray white halo around the button.
  '--tw-shadow-color',
]);

/** Properties that draw a hairline. Rings are excluded on purpose: a focus ring
 *  wants to be *more* visible in dark mode, so it rides the inverted ramp. */
const HAIRLINE_PROPS =
  /^(border(-(top|right|bottom|left|inline|block)(-(start|end))?)?-color|outline-color|column-rule-color|text-decoration-color)$/;

/** Properties that paint glyphs. */
const GLYPH_PROPS = new Set([
  'color',
  'fill',
  'stroke',
  '-webkit-text-fill-color',
  'caret-color',
]);

/** Saturated end of a ramp: keeps its original value when used as a surface. */
const SURFACE_PIN_FROM = 400;
/** Dark end of a ramp: keeps its original value when used as a hairline. */
const HAIRLINE_PIN_FROM = 700;
/** Light end of a ramp: keeps its original value when used as text. */
const GLYPH_PIN_TO = 200;

const RAMP_VAR = /var\(--color-([a-z]+)-(\d+)\)/g;
const WHITE_REF = 'var(--color-white)';
const WHITE_VAR = /var\(--color-white\)/g;

/**
 * `bg-white` in dark mode. Defined in src/index.css next to the rest of the
 * dark palette so the colours all live in one place.
 */
const DARK_SURFACE = 'var(--dark-surface)';
/** `border-white` in dark mode — a faint light hairline, not a white line. */
const DARK_HAIRLINE = 'var(--dark-hairline)';

/** Rules that define variables rather than consume them. */
const isDefinitionSelector = (selector) =>
  selector.includes(':root') || selector.includes(':host') || selector.startsWith('*');

/**
 * The original palette, read out of the `:root` block Tailwind emits for its
 * `@theme`. Pinning substitutes these literals, so a pinned declaration is
 * immune to the dark overrides applied to the same variable.
 */
const collectOriginalPalette = (root) => {
  const palette = new Map();
  root.walkRules((rule) => {
    if (!isDefinitionSelector(rule.selector)) return;
    rule.walkDecls(/^--color-/, (decl) => {
      // First definition wins: Tailwind's own `@theme` output comes before any
      // dark override the app layers on top.
      if (!palette.has(decl.prop)) palette.set(decl.prop, decl.value);
    });
  });
  return palette;
};

/**
 * The value this declaration should have in dark mode, or null when the
 * inverted ramp already gets it right.
 */
const pinnedValue = (prop, value, palette) => {
  const isSurface = SURFACE_PROPS.has(prop);
  const isHairline = HAIRLINE_PROPS.test(prop);
  const isGlyph = GLYPH_PROPS.has(prop);
  if (!isSurface && !isHairline && !isGlyph) return null;

  // `bg-white` / `border-white`, including every `/alpha` variant, which reach
  // here wrapped in a color-mix() around the same variable.
  if (value.includes(WHITE_REF)) {
    if (isSurface) return value.replace(WHITE_VAR, DARK_SURFACE);
    if (isHairline) return value.replace(WHITE_VAR, DARK_HAIRLINE);
    return null; // text-white stays white.
  }

  let changed = false;
  const pinned = value.replace(RAMP_VAR, (match, ramp, shadeText) => {
    const shade = Number(shadeText);
    const wanted =
      (isSurface && shade >= SURFACE_PIN_FROM) ||
      (isHairline && shade >= HAIRLINE_PIN_FROM) ||
      (isGlyph && shade <= GLYPH_PIN_TO);
    if (!wanted) return match;
    const original = palette.get(`--color-${ramp}-${shade}`);
    if (!original) return match;
    changed = true;
    return original;
  });

  return changed ? pinned : null;
};

/** @type {import('postcss').PluginCreator} */
const darkPalette = () => ({
  postcssPlugin: 'ccrm-dark-palette',
  OnceExit(root, { Rule }) {
    const palette = collectOriginalPalette(root);
    if (!palette.size) return;

    const clones = [];

    /** The rule a nested `&` would resolve against, if there is one. */
    const owningRule = (node) => {
      for (let parent = node; parent; parent = parent.parent) {
        if (parent.type === 'rule') return parent;
        if (parent.type === 'root') return null;
      }
      return null;
    };

    // Every container that holds declarations, not only rules: Tailwind nests
    // the `@supports (color-mix(…))` form of an alpha utility *inside* the rule,
    // so `bg-white/50`'s real declaration is a child of an at-rule and a
    // rules-only walk never sees it.
    root.walk((node) => {
      if (node.type !== 'rule' && node.type !== 'atrule') return;
      if (node.type === 'rule' && isDefinitionSelector(node.selector)) return;
      // Already scoped to a theme — by this plugin on an earlier pass, or by
      // hand in index.css. Leave it alone.
      if (node.type === 'rule' && node.selector.includes('data-theme')) return;

      const declsHere = (node.nodes || []).filter((child) => child.type === 'decl');
      if (!declsHere.length) return;

      const overrides = [];
      declsHere.forEach((decl) => {
        const pinned = pinnedValue(decl.prop, decl.value, palette);
        if (pinned !== null) overrides.push({ prop: decl.prop, value: pinned });
      });
      if (!overrides.length) return;

      // The override is nested, so it needs an enclosing selector for `&` to
      // mean anything. A declaration block with no rule above it (`@font-face`,
      // `@page`) has none, and has no colours worth theming either.
      if (!owningRule(node)) return;

      const clone = new Rule({ selector: DARK_SCOPE, source: node.source });
      overrides.forEach(({ prop, value }) => clone.append({ prop, value }));
      clones.push({ container: node, clone });
    });

    // Appended after the walk so the walker never descends into its own output.
    clones.forEach(({ container, clone }) => container.append(clone));
  },
});

darkPalette.postcss = true;

export default darkPalette;
