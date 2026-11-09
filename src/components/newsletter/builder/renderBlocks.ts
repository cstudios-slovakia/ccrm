/**
 * HTML of one block, as an e-mail-safe table. Used by the renderer AND by the canvas
 * (which injects the same markup), so what you edit is what is sent.
 *
 * Trust: `html` of text and heading blocks was sanitised with the `newsletter` profile
 * when it was edited. This module does not sanitise (it must run without a DOM).
 */
import type { EmailBlock, NewsletterTheme, RenderWarning } from './types.ts';
import { htmlEscape } from './mergeTags.ts';
import {
  SOCIAL_BADGES,
  STYLE_DEFAULTS,
  absoluteUrl,
  alignOf,
  attrs,
  buttonColors,
  buttonLinkStyle,
  clamp,
  cssText,
  decorateRichHtml,
  dividerValues,
  headingStyle,
  isDangerousUrl,
  isValidLinkUrl,
  num,
  safeColor,
  safeTheme,
  textBlockStyle,
} from './styles.ts';

export type BlockContext = {
  theme: NewsletterTheme;
  assetBaseUrl: string;
  /** Width in px available inside the column (column width minus its side padding). */
  innerWidth: number;
  warn?: (w: RenderWarning) => void;
};

const TABLE = 'role="presentation" border="0" cellpadding="0" cellspacing="0"';

export const makeWarning = (
  level: RenderWarning['level'],
  code: string,
  message: RenderWarning['message'],
  blockId?: string,
): RenderWarning => (blockId ? { level, code, blockId, message } : { level, code, message });

const warnBadUrl = (ctx: BlockContext, block: EmailBlock, url: string) => {
  if (url && isDangerousUrl(url)) {
    // The renderer outputs `#` for this href; the error stops the send.
    ctx.warn?.(
      makeWarning(
        'error',
        'dangerous_url',
        {
          en: 'A link uses javascript:, vbscript: or data: and was replaced by "#". Use an http(s), mailto or tel link.',
          sk: 'Odkaz používa javascript:, vbscript: alebo data: a bol nahradený znakom "#". Použite odkaz http(s), mailto alebo tel.',
          hu: 'Egy hivatkozás javascript:, vbscript: vagy data: kezdetű, ezért "#" váltotta fel. Használjon http(s), mailto vagy tel hivatkozást.',
        },
        block.id,
      ),
    );
  } else if (url && !isValidLinkUrl(url)) {
    ctx.warn?.(
      makeWarning(
        'warning',
        'bad_url',
        {
          en: `A link does not start with http://, https://, mailto: or tel: (${url}).`,
          sk: `Odkaz nezačína http://, https://, mailto: ani tel: (${url}).`,
          hu: `Egy hivatkozás nem http://, https://, mailto: vagy tel: kezdetű (${url}).`,
        },
        block.id,
      ),
    );
  }
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')',
};

/** What a browser decodes in an attribute value: numeric references and the usual names. */
const decodeAttr = (s: string): string =>
  s.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));?/gi, (m, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (name !== undefined) return NAMED_ENTITIES[name.toLowerCase()] ?? m;
    try {
      return String.fromCodePoint(hex !== undefined ? parseInt(hex, 16) : parseInt(dec as string, 10));
    } catch {
      return m;
    }
  });

const ANCHOR_TAG = /<a\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** The first `href` attribute of an anchor tag, as a browser would read it. */
const findHref = (tag: string): { raw: string; offset: number; value: string } | null => {
  const inner = tag.slice(2, tag.endsWith('/>') ? -2 : -1);
  for (const m of inner.matchAll(ATTRIBUTE)) {
    if (m[1].toLowerCase() === 'href') return { raw: m[0], offset: 2 + (m.index ?? 0), value: decodeAttr(m[2] ?? m[3] ?? m[4] ?? '') };
  }
  return null;
};

/** The `href` values of the anchors in a piece of HTML. */
export const anchorHrefs = (html: string): string[] =>
  [...html.matchAll(ANCHOR_TAG)].flatMap((m) => {
    const h = findHref(m[0]);
    return h ? [h.value] : [];
  });

/** Anchors whose href is dangerous (see `isDangerousUrl`) get `href="#"`. */
export const neutralizeDangerousAnchors = (html: string): string =>
  html.replace(ANCHOR_TAG, (tag) => {
    const h = findHref(tag);
    return h && isDangerousUrl(h.value) ? `${tag.slice(0, h.offset)}href="#"${tag.slice(h.offset + h.raw.length)}` : tag;
  });

/** An href for the output: `#` when it is dangerous. */
const safeHref = (href: string): string => (isDangerousUrl(href) ? '#' : href);

const wrap = (inner: string, tdAttrs = '', tdStyle = `padding:${STYLE_DEFAULTS.blockPadY}px 0`): string =>
  `<table ${TABLE} width="100%"><tr><td${tdAttrs} style="${htmlEscape(tdStyle)}">${inner}</td></tr></table>`;

const alignedTable = (inner: string, align: string): string =>
  `<table ${TABLE} align="${align}"><tr><td>${inner}</td></tr></table>`;

export const renderBlockHtml = (block: EmailBlock, ctx: BlockContext): string => {
  const theme = safeTheme(ctx.theme);
  switch (block.type) {
    case 'text': {
      for (const href of anchorHrefs(block.html)) warnBadUrl(ctx, block, href);
      const style = cssText({ padding: `${STYLE_DEFAULTS.blockPadY}px 0`, ...textBlockStyle(block, theme) });
      return `<table ${TABLE} width="100%"><tr><td align="${alignOf(block.align)}" style="${htmlEscape(style)}">${decorateRichHtml(neutralizeDangerousAnchors(block.html), theme)}</td></tr></table>`;
    }
    case 'heading': {
      for (const href of anchorHrefs(block.html)) warnBadUrl(ctx, block, href);
      const tag = `h${block.level === 1 || block.level === 3 ? block.level : 2}`;
      return wrap(
        `<${tag} style="${htmlEscape(cssText(headingStyle(block, theme)))}">${decorateRichHtml(neutralizeDangerousAnchors(block.html), theme)}</${tag}>`,
        ` align="${alignOf(block.align)}"`,
      );
    }
    case 'image': {
      if (!block.src.trim()) {
        ctx.warn?.(
          makeWarning('warning', 'image_no_src', { en: 'An image block has no image.', sk: 'Obrázkový blok nemá obrázok.', hu: 'Egy képblokkhoz nincs kép megadva.' }, block.id),
        );
        return '';
      }
      if (/^\s*data:/i.test(block.src)) {
        ctx.warn?.(
          makeWarning(
            'error',
            'data_url_image',
            {
              en: 'An image is embedded as a data URL and will not show in most mail clients. Upload the image instead.',
              sk: 'Obrázok je vložený ako data URL a vo väčšine e-mailových klientov sa nezobrazí. Nahrajte ho radšej na server.',
              hu: 'Egy kép data URL-ként van beágyazva, és a legtöbb levelezőben nem jelenik meg. Töltse fel inkább a képet.',
            },
            block.id,
          ),
        );
      }
      if (!block.alt.trim()) {
        ctx.warn?.(
          makeWarning('warning', 'image_no_alt', { en: 'An image has no alt text.', sk: 'Obrázok nemá alternatívny text.', hu: 'Egy képhez nincs alternatív szöveg.' }, block.id),
        );
      }
      const width = clamp(Math.round(num(block.width, ctx.innerWidth)), 1, Math.max(1, ctx.innerWidth));
      const img = `<img${attrs({ src: absoluteUrl(block.src, ctx.assetBaseUrl) })} alt="${htmlEscape(block.alt)}"${attrs({ width })} style="display:block;max-width:100%;height:auto;border:0">`;
      const href = (block.href ?? '').trim();
      warnBadUrl(ctx, block, href);
      const linked = href ? `<a${attrs({ href: safeHref(href) })} target="_blank" style="text-decoration:none">${img}</a>` : img;
      return wrap(alignedTable(linked, alignOf(block.align)), '', `padding:${STYLE_DEFAULTS.blockPadY}px 0`);
    }
    case 'button': {
      const href = block.href.trim();
      if (!href) {
        ctx.warn?.(
          makeWarning('warning', 'button_no_href', { en: 'A button has no link.', sk: 'Tlačidlo nemá odkaz.', hu: 'Egy gombhoz nincs hivatkozás.' }, block.id),
        );
      } else {
        warnBadUrl(ctx, block, href);
      }
      const c = buttonColors(block, theme);
      const align = alignOf(block.align);
      const cell = `<td align="center" bgcolor="${htmlEscape(c.background)}" style="${htmlEscape(cssText({ 'background-color': c.background, 'border-radius': `${c.radius}px` }))}"><a${attrs({ href: safeHref(href) || '#' })} target="_blank" style="${htmlEscape(cssText(buttonLinkStyle(block, theme)))}">${htmlEscape(block.label)}</a></td>`;
      const table = block.fullWidth
        ? `<table ${TABLE} width="100%"><tr>${cell}</tr></table>`
        : `<table ${TABLE} align="${align}"><tr>${cell}</tr></table>`;
      return wrap(table, ` align="${align}"`);
    }
    case 'divider': {
      const d = dividerValues(block);
      const line = `<table ${TABLE} align="center" width="${d.widthPercent}%" style="width:${d.widthPercent}%"><tr><td height="${d.thickness}" style="${htmlEscape(`border-top:${d.thickness}px solid ${d.color};font-size:0;line-height:0`)}">&nbsp;</td></tr></table>`;
      return wrap(line);
    }
    case 'spacer': {
      const h = clamp(Math.round(num(block.height, STYLE_DEFAULTS.spacerHeight)), 1, 400);
      return `<table ${TABLE} width="100%"><tr><td height="${h}" style="height:${h}px;font-size:${h}px;line-height:${h}px">&nbsp;</td></tr></table>`;
    }
    case 'social': {
      const size = STYLE_DEFAULTS.socialBadge;
      const cells: string[] = [];
      for (const item of block.items) {
        const url = item.url.trim();
        if (!url) {
          ctx.warn?.(
            makeWarning('warning', 'bad_url', { en: 'A social link has no URL.', sk: 'Odkaz na sociálnu sieť nemá adresu.', hu: 'Egy közösségi hivatkozásnak nincs URL-je.' }, block.id),
          );
          continue;
        }
        warnBadUrl(ctx, block, url);
        const known = Object.prototype.hasOwnProperty.call(SOCIAL_BADGES, item.network);
        const base = known ? SOCIAL_BADGES[item.network] : SOCIAL_BADGES.website;
        const badge = { ...base, color: safeColor(base.color, SOCIAL_BADGES.website.color) };
        const link = cssText({
          display: 'block',
          width: `${size}px`,
          height: `${size}px`,
          'line-height': `${size}px`,
          'font-family': 'Arial, Helvetica, sans-serif',
          'font-size': '12px',
          'font-weight': 'bold',
          color: '#ffffff',
          'text-decoration': 'none',
          'text-align': 'center',
        });
        const td = cssText({ width: `${size}px`, height: `${size}px`, 'background-color': badge.color, 'border-radius': '50%' });
        cells.push(
          `<td style="padding:0 4px"><table ${TABLE}><tr><td width="${size}" height="${size}" align="center" valign="middle"${attrs({ bgcolor: badge.color })} style="${htmlEscape(td)}"><a${attrs({ href: safeHref(url), title: badge.name })} target="_blank" style="${htmlEscape(link)}">${htmlEscape(badge.label)}</a></td></tr></table></td>`,
        );
      }
      if (cells.length === 0) return '';
      const align = alignOf(block.align, 'center');
      return wrap(`<table ${TABLE} align="${align}"><tr>${cells.join('')}</tr></table>`, ` align="${align}"`);
    }
    case 'html':
      return `<table ${TABLE} width="100%"><tr><td>${block.html}</td></tr></table>`;
  }
};

/** Every author-written string of a block, for the merge-tag scan. */
export const blockStrings = (block: EmailBlock): string[] => {
  switch (block.type) {
    case 'text':
    case 'heading':
    case 'html':
      return [block.html];
    case 'image':
      return [block.src, block.alt, block.href ?? ''];
    case 'button':
      return [block.label, block.href];
    case 'social':
      return block.items.map((i) => i.url);
    default:
      return [];
  }
};
