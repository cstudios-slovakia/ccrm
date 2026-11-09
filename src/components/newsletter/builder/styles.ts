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
import { LAYOUT_RATIOS } from './defaults.ts';
import { htmlEscape } from './mergeTags.ts';

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

const num = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export const rowPaddingTop = (row: EmailRow): number => Math.max(0, num(row.paddingTop, STYLE_DEFAULTS.rowPadding));
export const rowPaddingBottom = (row: EmailRow): number => Math.max(0, num(row.paddingBottom, STYLE_DEFAULTS.rowPadding));
export const columnPaddingX = (col: EmailColumn): number => Math.max(0, num(col.paddingX, STYLE_DEFAULTS.columnPaddingX));
export const rowContentBackground = (row: EmailRow, theme: NewsletterTheme): string => row.contentBackground || theme.contentBackground;
export const rowStacks = (row: EmailRow): boolean => row.stackOnMobile !== false && row.columns.length > 1;

/** Column widths in whole px that add up to `contentWidth`. */
export const columnWidths = (layout: RowLayout, contentWidth: number): number[] => {
  const ratios = LAYOUT_RATIOS[layout];
  const total = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor((contentWidth * r) / total));
  widths[widths.length - 1] += contentWidth - widths.reduce((a, b) => a + b, 0);
  return widths;
};

export const valign = (col: EmailColumn): VerticalAlign => col.verticalAlign ?? 'top';
export const alignOf = (a: Align | undefined): Align => a ?? 'left';

export const textBlockStyle = (b: TextBlock, theme: NewsletterTheme): CssMap => ({
  'font-family': theme.fontFamily,
  'font-size': `${num(b.fontSize, STYLE_DEFAULTS.fontSize)}px`,
  'line-height': String(num(b.lineHeight, STYLE_DEFAULTS.lineHeight)),
  color: b.color || theme.textColor,
  'text-align': alignOf(b.align),
});

export const headingStyle = (b: HeadingBlock, theme: NewsletterTheme): CssMap => ({
  margin: '0',
  'font-family': theme.fontFamily,
  'font-size': `${HEADING_SIZES[b.level] ?? HEADING_SIZES[2]}px`,
  'line-height': String(STYLE_DEFAULTS.headingLineHeight),
  'font-weight': 'bold',
  color: b.color || theme.textColor,
  'text-align': alignOf(b.align),
});

export const buttonColors = (b: ButtonBlock, theme: NewsletterTheme) => ({
  background: b.background || theme.buttonBackground,
  color: b.color || theme.buttonTextColor,
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
  color: b.color || STYLE_DEFAULTS.dividerColor,
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
export const startsWithMergeTag = (url: string): boolean => /^\s*\{\{/.test(url);

/** Make a relative image URL absolute with `assetBaseUrl`. Absolute, `data:`, `cid:` and merge-tag URLs stay. */
export const absoluteUrl = (url: string, assetBaseUrl: string): string => {
  const u = url.trim();
  if (!u) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u) || startsWithMergeTag(u)) return u;
  const base = assetBaseUrl.replace(/\/+$/, '');
  if (!base) return u;
  return u.startsWith('/') ? `${base}${u}` : `${base}/${u}`;
};

/** A link target we accept: http(s), mailto, tel or a merge tag. */
export const isValidLinkUrl = (url: string): boolean => /^\s*(?:https?:\/\/\S|mailto:\S|tel:\S|\{\{)/i.test(url);

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
    /\sstyle\s*=/i.test(rest) ? full : `<a${rest} style="color:${htmlEscape(theme.linkColor)};text-decoration:underline">`,
  );
};

/** CSS for the in-canvas text editor, so typed text is spaced like the rendered block. */
export const richEditorCss = (scope: string, theme: NewsletterTheme): string =>
  `${scope} p{margin:0 0 ${STYLE_DEFAULTS.paragraphGap}px}${scope} p:last-child{margin:0}` +
  `${scope} ul,${scope} ol{margin:0 0 ${STYLE_DEFAULTS.paragraphGap}px;padding-left:24px}` +
  `${scope} a{color:${theme.linkColor};text-decoration:underline}`;
