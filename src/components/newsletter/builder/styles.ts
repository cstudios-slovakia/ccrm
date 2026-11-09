/**
 * Style computation shared by the renderer (inline CSS strings) and the canvas (React
 * styles), so the canvas looks like the output. Pure.
 */
import type {
  Align,
  ButtonBlock,
  DividerBlock,
  EmailColumn,
  EmailRow,
  HeadingBlock,
  NewsletterTheme,
  RowLayout,
  SocialNetwork,
  TextBlock,
  VerticalAlign,
} from './types.ts';
import { LAYOUT_RATIOS, THEME_DEFAULTS, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN } from './defaults.ts';
import { decodeFallbackEntities, htmlEscape, isMergeTagUrl, parseMergeTags } from './mergeTags.ts';

export const STYLE_DEFAULTS = {
  fontSize: 16,
  lineHeight: 1.5,
  rowPadding: 16,
  columnPaddingX: 16,
  buttonRadius: 6,
  dividerColor: '#e2e8f0',
  dividerThickness: 1,
  dividerWidthPercent: 100,
  spacerHeight: 24,
  /** Vertical padding above and below a text, heading, image, button, divider or social block. */
  blockPadY: 8,
  paragraphGap: 12,
  headingLineHeight: 1.25,
  socialBadge: 28,
} as const;

export const HEADING_SIZES: Record<1 | 2 | 3, number> = { 1: 28, 2: 22, 3: 18 };

export type CssMap = Record<string, string>;

/** `{ 'font-size': '16px' }` -> `font-size:16px`. Deterministic: insertion order. */
export const cssText = (map: CssMap): string =>
  Object.entries(map)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

/** A CssMap as a React `style` object (camelCase keys). */
export const reactStyle = (map: CssMap): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return out;
};

/** `{ name: 'x' }` -> ` name="x"` with the value escaped. Skips undefined and empty values. */
export const attrs = (map: Record<string, string | number | undefined | null>): string =>
  Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${htmlEscape(String(v))}"`)
    .join('');

export const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

export const num = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ---- values from the document ------------------------------------------------------------
// Nothing the document or the theme holds reaches an attribute, a style or the <style> block
// unless it went through one of these. The canvas uses them too, so canvas and output agree.

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^rgba?\(\s*[0-9.]+%?(?:\s*,\s*[0-9.]+%?){2,3}\s*\)$/i;
const NAMED_COLOR = /^[a-z]+$/i;

/**
 * A CSS colour we accept: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` with numbers, or a
 * named colour made of letters. Anything else (including a non-string) gives `fallback`.
 */
export const safeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  return HEX_COLOR.test(v) || FUNC_COLOR.test(v) || NAMED_COLOR.test(v) ? v : fallback;
};

/** Value of an enum from the document, or `fallback` when it is not one of `allowed`. */
export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const ALIGNS: readonly Align[] = ['left', 'center', 'right'];
const VALIGNS: readonly VerticalAlign[] = ['top', 'middle', 'bottom'];

const FONT_FAMILY = /^[A-Za-z0-9 ,'"._-]{1,200}$/;

/**
 * The theme with every value made safe: colours through `safeColor`, a font stack of plain
 * characters only, the content width a whole number inside its range.
 */
export const safeTheme = (theme: NewsletterTheme): NewsletterTheme => ({
  contentWidth: Math.round(clamp(num(theme.contentWidth, THEME_DEFAULTS.contentWidth), CONTENT_WIDTH_MIN, CONTENT_WIDTH_MAX)),
  pageBackground: safeColor(theme.pageBackground, THEME_DEFAULTS.pageBackground),
  contentBackground: safeColor(theme.contentBackground, THEME_DEFAULTS.contentBackground),
  fontFamily: typeof theme.fontFamily === 'string' && FONT_FAMILY.test(theme.fontFamily) ? theme.fontFamily : THEME_DEFAULTS.fontFamily,
  textColor: safeColor(theme.textColor, THEME_DEFAULTS.textColor),
  linkColor: safeColor(theme.linkColor, THEME_DEFAULTS.linkColor),
  buttonBackground: safeColor(theme.buttonBackground, THEME_DEFAULTS.buttonBackground),
  buttonTextColor: safeColor(theme.buttonTextColor, THEME_DEFAULTS.buttonTextColor),
});

export const rowPaddingTop = (row: EmailRow): number => Math.max(0, num(row.paddingTop, STYLE_DEFAULTS.rowPadding));
export const rowPaddingBottom = (row: EmailRow): number => Math.max(0, num(row.paddingBottom, STYLE_DEFAULTS.rowPadding));
export const columnPaddingX = (col: EmailColumn): number => Math.max(0, num(col.paddingX, STYLE_DEFAULTS.columnPaddingX));
/** The row's own colour (empty or invalid: none). */
export const rowBackground = (row: EmailRow): string => safeColor(row.background, '');
export const rowContentBackground = (row: EmailRow, theme: NewsletterTheme): string =>
  safeColor(row.contentBackground, safeColor(theme.contentBackground, THEME_DEFAULTS.contentBackground));
export const rowStacks = (row: EmailRow): boolean => row.stackOnMobile !== false && row.columns.length > 1;

/** Column widths in whole px that add up to `contentWidth`. */
export const columnWidths = (layout: RowLayout, contentWidth: number): number[] => {
  const ratios = Object.prototype.hasOwnProperty.call(LAYOUT_RATIOS, layout) ? LAYOUT_RATIOS[layout] : LAYOUT_RATIOS['1'];
  const total = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor((contentWidth * r) / total));
  widths[widths.length - 1] += contentWidth - widths.reduce((a, b) => a + b, 0);
  return widths;
};

export const valign = (col: EmailColumn): VerticalAlign => oneOf(col.verticalAlign, VALIGNS, 'top');
export const alignOf = (a: Align | undefined, fallback: Align = 'left'): Align => oneOf(a, ALIGNS, fallback);

export const textBlockStyle = (b: TextBlock, theme: NewsletterTheme): CssMap => ({
  'font-family': theme.fontFamily,
  'font-size': `${num(b.fontSize, STYLE_DEFAULTS.fontSize)}px`,
  'line-height': String(num(b.lineHeight, STYLE_DEFAULTS.lineHeight)),
  color: safeColor(b.color, safeColor(theme.textColor, THEME_DEFAULTS.textColor)),
  'text-align': alignOf(b.align),
});

export const headingStyle = (b: HeadingBlock, theme: NewsletterTheme): CssMap => ({
  margin: '0',
  'font-family': theme.fontFamily,
  'font-size': `${HEADING_SIZES[b.level] ?? HEADING_SIZES[2]}px`,
  'line-height': String(STYLE_DEFAULTS.headingLineHeight),
  'font-weight': 'bold',
  color: safeColor(b.color, safeColor(theme.textColor, THEME_DEFAULTS.textColor)),
  'text-align': alignOf(b.align),
});

export const buttonColors = (b: ButtonBlock, theme: NewsletterTheme) => ({
  background: safeColor(b.background, safeColor(theme.buttonBackground, THEME_DEFAULTS.buttonBackground)),
  color: safeColor(b.color, safeColor(theme.buttonTextColor, THEME_DEFAULTS.buttonTextColor)),
  radius: Math.max(0, num(b.radius, STYLE_DEFAULTS.buttonRadius)),
});

export const buttonLinkStyle = (b: ButtonBlock, theme: NewsletterTheme): CssMap => {
  const c = buttonColors(b, theme);
  return {
    display: b.fullWidth ? 'block' : 'inline-block',
    padding: '12px 24px',
    'font-family': theme.fontFamily,
    'font-size': '16px',
    'line-height': '20px',
    'font-weight': 'bold',
    color: c.color,
    'text-decoration': 'none',
    'border-radius': `${c.radius}px`,
    'text-align': 'center',
  };
};

export const dividerValues = (b: DividerBlock) => ({
  color: safeColor(b.color, STYLE_DEFAULTS.dividerColor),
  thickness: clamp(num(b.thickness, STYLE_DEFAULTS.dividerThickness), 1, 20),
  widthPercent: clamp(num(b.widthPercent, STYLE_DEFAULTS.dividerWidthPercent), 5, 100),
});

/** Badges drawn instead of icon images (the orchestrator's deviation from C6). */
export const SOCIAL_BADGES: Record<SocialNetwork, { name: string; label: string; color: string }> = {
  facebook: { name: 'Facebook', label: 'f', color: '#1877f2' },
  instagram: { name: 'Instagram', label: 'IG', color: '#c13584' },
  linkedin: { name: 'LinkedIn', label: 'in', color: '#0a66c2' },
  x: { name: 'X', label: 'X', color: '#111111' },
  youtube: { name: 'YouTube', label: '▶', color: '#ff0000' },
  tiktok: { name: 'TikTok', label: 'TT', color: '#010101' },
  website: { name: 'Website', label: 'www', color: '#64748b' },
};

/** True for a `{{merge_tag}}` that starts the value, so it is a valid URL as far as we can know. */
export const startsWithMergeTag = (url: string): boolean => /^[ \t\r\n]*\{\{/.test(url);

/** Make a relative image URL absolute with `assetBaseUrl`. Absolute, `data:`, `cid:` and merge-tag URLs stay. */
export const absoluteUrl = (url: string, assetBaseUrl: string): string => {
  const u = url.trim();
  if (!u) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u) || startsWithMergeTag(u)) return u;
  const base = assetBaseUrl.replace(/\/+$/, '');
  if (!base) return u;
  return u.startsWith('/') ? `${base}${u}` : `${base}/${u}`;
};

const DANGEROUS_SCHEME = /^(?:javascript|vbscript|data):/i;

/** True when `value`, ignoring ASCII whitespace and control characters (browsers drop them), starts with a script-capable scheme. */
export const hasDangerousScheme = (value: string): boolean =>
  DANGEROUS_SCHEME.test(value.replace(/[\u0000- \u007f]+/g, ''));

/** The leading merge tag of an href, its fallback, and what follows it, or null when the href does not start with one. */
const leadingTag = (url: string): { fallback: string; rest: string } | null => {
  if (!isMergeTagUrl(url)) return null;
  const lead = (/^[ \t\r\n]*/.exec(url) as RegExpExecArray)[0].length;
  const first = parseMergeTags(url).find((p) => p.index === lead);
  if (!first) return { fallback: '', rest: '' };
  return { fallback: first.fallback ?? '', rest: url.slice(first.index + first.raw.length) };
};

/**
 * An href that could run script: `javascript:`, `vbscript:` or `data:` (any case, any hidden
 * whitespace or control characters), either as the href itself or in the fallback of a leading
 * merge tag (`{{x|javascript:...}}`), or right after a leading tag that may come out empty.
 */
export const isDangerousUrl = (url: string): boolean => {
  if (hasDangerousScheme(url)) return true;
  const lead = leadingTag(url);
  if (!lead) return false;
  return hasDangerousScheme(lead.fallback) || hasDangerousScheme(decodeFallbackEntities(lead.fallback)) || hasDangerousScheme(lead.rest);
};

/** A link target we accept: http(s), mailto, tel or a merge tag (whose fallback must be one of those too). */
export const isValidLinkUrl = (url: string): boolean => {
  if (!/^[ \t\r\n]*(?:https?:\/\/\S|mailto:\S|tel:\S|\{\{)/i.test(url)) return false;
  const lead = leadingTag(url);
  if (!lead || !lead.fallback) return true;
  return isValidLinkUrl(lead.fallback) && !isMergeTagUrl(lead.fallback);
};

const RICH_BLOCK_TAG = /<(p|ul|ol)(?=[\s>])[^>]*>/gi;
const RICH_ANCHOR = /<a\b([^>]*)>/gi;

/**
 * Give sanitised text/heading HTML its inline presentation: paragraph and list spacing
 * (the last one has none) and the link colour. The editor sanitiser strips `style` from
 * these tags, so the only styles here come from this function.
 */
export const decorateRichHtml = (html: string, theme: NewsletterTheme): string => {
  const total = (html.match(RICH_BLOCK_TAG) ?? []).length;
  let n = 0;
  const spaced = html.replace(RICH_BLOCK_TAG, (_full, tag: string) => {
    const margin = ++n === total ? '0' : `0 0 ${STYLE_DEFAULTS.paragraphGap}px`;
    const list = tag.toLowerCase() === 'p' ? '' : ';padding-left:24px';
    return `<${tag.toLowerCase()} style="margin:${margin}${list}">`;
  });
  return spaced.replace(RICH_ANCHOR, (full, rest: string) =>
    /\sstyle\s*=/i.test(rest) ? full : `<a${rest} style="color:${htmlEscape(safeColor(theme.linkColor, THEME_DEFAULTS.linkColor))};text-decoration:underline">`,
  );
};

/** CSS for the in-canvas text editor, so typed text is spaced like the rendered block. */
export const richEditorCss = (scope: string, theme: NewsletterTheme): string =>
  `${scope} p{margin:0 0 ${STYLE_DEFAULTS.paragraphGap}px}${scope} p:last-child{margin:0}` +
  `${scope} ul,${scope} ol{margin:0 0 ${STYLE_DEFAULTS.paragraphGap}px;padding-left:24px}` +
  `${scope} a{color:${safeColor(theme.linkColor, THEME_DEFAULTS.linkColor)};text-decoration:underline}`;
