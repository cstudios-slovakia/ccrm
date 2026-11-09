/**
 * DOM helpers for the inline text editor (browser only; the pure parts of the builder
 * never import this). Turns whatever a contenteditable (or the clipboard) produced into
 * the `newsletter` profile's HTML.
 */
import { sanitizeRichHtml } from '../../../utils/safeHtml';

const INLINE_TAGS = new Set(['SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'A', 'BR', 'FONT', 'STRIKE', 'DEL', 'CODE', 'MARK', 'SUB', 'SUP']);

/** True when the HTML shows nothing (no text; a lone <br> or &nbsp; is nothing). */
export const isEmptyRich = (html: string): boolean =>
  html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&zwnj;| |‌/gi, '')
    .trim() === '';

const toParagraphs = (body: HTMLElement): void => {
  const doc = body.ownerDocument;
  // Chrome makes <div>s on Enter; pasted content brings headings, quotes and the like.
  body.querySelectorAll('div, h1, h2, h3, h4, h5, h6, blockquote, pre, section, article, table, tr, td').forEach((el) => {
    const p = doc.createElement('p');
    while (el.firstChild) p.appendChild(el.firstChild);
    el.replaceWith(p);
  });
  // Loose inline nodes at the top level (text typed before the first Enter) go into a paragraph.
  let run: HTMLParagraphElement | null = null;
  for (const node of Array.from(body.childNodes)) {
    const isInline = node.nodeType === 3 || (node.nodeType === 1 && INLINE_TAGS.has((node as Element).tagName));
    if (isInline) {
      if (!run) {
        run = doc.createElement('p');
        body.insertBefore(run, node);
      }
      run.appendChild(node);
    } else {
      run = null;
    }
  }
};

/**
 * Clean the HTML of an edited text block. `inline` (headings) has no paragraphs: they
 * become line breaks. Returns '' for an empty block.
 */
export const cleanEditedHtml = (raw: string, inline: boolean): string => {
  const body = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html').body;
  toParagraphs(body);
  let html = body.innerHTML;
  if (inline) html = html.replace(/<\/p>\s*<p>/gi, '<br>').replace(/<\/?p>/gi, '');
  const clean = sanitizeRichHtml(html, 'newsletter').trim();
  return isEmptyRich(clean) ? '' : clean;
};

/** HTML from the clipboard, ready for execCommand('insertHTML'); a single paragraph is unwrapped. */
export const cleanPastedHtml = (raw: string, inline: boolean): string => {
  const cleaned = cleanEditedHtml(raw.replace(/<!--[\s\S]*?-->/g, ''), inline);
  const single = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/i.exec(cleaned);
  return single ? single[1] : cleaned;
};

export const plainTextToRich = (text: string, inline: boolean): string => {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = escaped.split(/\r?\n/);
  if (inline || lines.length === 1) return lines.join('<br>');
  return lines.map((l) => `<p>${l || '<br>'}</p>`).join('');
};
