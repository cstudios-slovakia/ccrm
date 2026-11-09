/**
 * `renderEmail()`: header + body + footer + theme -> the e-mail HTML, its plain-text
 * version and warnings (docs/NEWSLETTER.md C7). Pure and deterministic; no DOM, no
 * sanitiser: text and heading `html` is trusted to have been sanitised when edited.
 */
import type { EmailDoc, EmailRow, NewsletterTheme, RenderInput, RenderResult, RenderWarning } from './types.ts';
import { findUnknownMergeTags, htmlEscape } from './mergeTags.ts';
import { blockStrings, makeWarning, renderBlockHtml } from './renderBlocks.ts';
import { renderText } from './renderText.ts';
import {
  attrs,
  columnPaddingX,
  columnWidths,
  cssText,
  rowContentBackground,
  rowPaddingBottom,
  rowPaddingTop,
  rowStacks,
  valign,
} from './styles.ts';

const TABLE = 'role="presentation" border="0" cellpadding="0" cellspacing="0"';
const PREHEADER_PAD = '&zwnj;&nbsp;'.repeat(60);

const bgAttr = (color: string | undefined): string =>
  color && color !== 'transparent' ? attrs({ bgcolor: color }) : '';
const bgStyle = (color: string | undefined): string =>
  color && color !== 'transparent' ? `background-color:${color};` : '';

type RowContext = { theme: NewsletterTheme; assetBaseUrl: string; warn: (w: RenderWarning) => void };

const renderRow = (row: EmailRow, ctx: RowContext): string => {
  const { theme } = ctx;
  const W = theme.contentWidth;
  const widths = columnWidths(row.layout, W);
  const content = rowContentBackground(row, theme);
  const columnHtml = row.columns.map((column, i) => {
    const padX = columnPaddingX(column);
    const blocks = column.blocks
      .map((b) => renderBlockHtml(b, { theme, assetBaseUrl: ctx.assetBaseUrl, innerWidth: Math.max(1, (widths[i] ?? W) - 2 * padX), warn: ctx.warn }))
      .filter(Boolean)
      .join('\n');
    return { column, padX, blocks, width: widths[i] ?? W };
  });

  let inner: string;
  if (rowStacks(row)) {
    const parts = columnHtml.map(({ column, padX, blocks, width }, i) => {
      const va = valign(column);
      const ghostOpen = i === 0
        ? `<!--[if mso]><table ${TABLE} width="${W}"><tr><td width="${width}" valign="${va}"><![endif]-->`
        : `<!--[if mso]></td><td width="${width}" valign="${va}"><![endif]-->`;
      const div = `<div class="nl-col" style="${cssText({ display: 'inline-block', width: '100%', 'max-width': `${width}px`, 'vertical-align': va, 'font-size': '16px', 'text-align': 'left' })}"><table ${TABLE} width="100%"><tr><td style="padding:0 ${padX}px">${blocks}</td></tr></table></div>`;
      return `${ghostOpen}\n${div}`;
    });
    inner = `${parts.join('\n')}\n<!--[if mso]></td></tr></table><![endif]-->`;
  } else {
    const cells = columnHtml.map(
      ({ column, padX, blocks, width }) =>
        `<td width="${width}" valign="${valign(column)}" style="width:${+((width / W) * 100).toFixed(2)}%;padding:0 ${padX}px;vertical-align:${valign(column)}">${blocks}</td>`,
    );
    inner = `<table ${TABLE} width="100%"><tr>${cells.join('')}</tr></table>`;
  }

  const stackedStyle = rowStacks(row) ? 'font-size:0;text-align:center;' : '';
  return (
    `<table ${TABLE} width="100%"${bgAttr(row.background)}${bgStyle(row.background) ? ` style="${bgStyle(row.background)}"` : ''}><tr><td align="center">` +
    `<table ${TABLE} width="${W}"${bgAttr(content)} style="width:100%;max-width:${W}px;${bgStyle(content)}"><tr>` +
    `<td style="padding:${rowPaddingTop(row)}px 0 ${rowPaddingBottom(row)}px 0;${stackedStyle}">\n${inner}\n</td>` +
    `</tr></table></td></tr></table>`
  );
};

const hasBlocks = (doc: EmailDoc): boolean => doc.rows.some((r) => r.columns.some((c) => c.blocks.length > 0));

const UNSUBSCRIBE_TAG = /\{\{\s*unsubscribe_url\s*(?:\|[^{}]*)?\}\}/;

export const renderEmail = (input: RenderInput): RenderResult => {
  const { theme, subject, assetBaseUrl } = input;
  const lang = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(input.lang) ? input.lang : 'en';
  const warnings: RenderWarning[] = [];
  const warn = (w: RenderWarning) => warnings.push(w);
  const ctx: RowContext = { theme, assetBaseUrl, warn };

  const docs = [input.header, input.body, input.footer];
  const rowsHtml = docs.flatMap((d) => (d ? d.rows.map((r) => renderRow(r, ctx)) : []));

  if (!hasBlocks(input.body)) {
    warn(makeWarning('warning', 'empty_body', { en: 'The e-mail body is empty.', sk: 'Telo e-mailu je prázdne.', hu: 'Az e-mail törzse üres.' }));
  }

  // Merge tags that are not in the C9 list: per block, plus the subject and the preheader.
  for (const doc of docs) {
    if (!doc) continue;
    for (const row of doc.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) {
          for (const tag of findUnknownMergeTags(blockStrings(block).join('\n'))) warn(unknownTag(tag, block.id));
        }
      }
    }
  }
  for (const tag of findUnknownMergeTags(`${subject}\n${input.preheader ?? ''}`)) warn(unknownTag(tag));

  const bodyHtml = rowsHtml.join('\n');
  if (!UNSUBSCRIBE_TAG.test(bodyHtml)) {
    warn(
      makeWarning('error', 'missing_unsubscribe', {
        en: 'The e-mail has no unsubscribe link. Add {{unsubscribe_url}}, for example in the footer.',
        sk: 'E-mail nemá odkaz na odhlásenie. Pridajte {{unsubscribe_url}}, napríklad do pätičky.',
        hu: 'Az e-mailben nincs leiratkozási hivatkozás. Adja hozzá a {{unsubscribe_url}} címkét, például a láblécben.',
      }),
    );
  }

  const preheader = (input.preheader ?? '').trim();
  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${htmlEscape(preheader)}${PREHEADER_PAD}</div>\n`
    : '';

  const html =
    `<!doctype html>\n` +
    `<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">\n` +
    `<meta name="x-apple-disable-message-reformatting">\n` +
    `<meta name="color-scheme" content="light">\n` +
    `<meta name="supported-color-schemes" content="light">\n` +
    `<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->\n` +
    `<title>${htmlEscape(subject)}</title>\n` +
    `<style>\n` +
    `body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}\n` +
    `table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}\n` +
    `img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}\n` +
    `a{color:${theme.linkColor}}\n` +
    `@media only screen and (max-width:${theme.contentWidth + 20}px){.nl-col{display:block!important;width:100%!important;max-width:100%!important}}\n` +
    `</style>\n` +
    `</head>\n` +
    `<body style="margin:0;padding:0;${bgStyle(theme.pageBackground)}font-family:${htmlEscape(theme.fontFamily)}">\n` +
    preheaderHtml +
    `<table ${TABLE} width="100%"${bgAttr(theme.pageBackground)} style="${bgStyle(theme.pageBackground)}"><tr><td align="center">\n` +
    `${bodyHtml}\n` +
    `</td></tr></table>\n` +
    `</body>\n</html>\n`;

  return { html, text: renderText(docs), warnings };
};

const unknownTag = (tag: string, blockId?: string): RenderWarning =>
  makeWarning(
    'warning',
    'unknown_merge_tag',
    {
      en: `Unknown merge tag {{${tag}}}. It will be left empty in the sent e-mail.`,
      sk: `Neznáme pole {{${tag}}}. V odoslanom e-maile zostane prázdne.`,
      hu: `Ismeretlen címke: {{${tag}}}. A kiküldött e-mailben üres marad.`,
    },
    blockId,
  );
