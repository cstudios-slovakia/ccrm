/**
 * The plain-text part of the e-mail, built from the blocks (not by stripping the final
 * HTML): headings and paragraphs as lines, links as `label (url)`, buttons as
 * `label: url`, images by alt text, dividers as `----`. Pure.
 */
import type { EmailBlock, EmailDoc } from './types.ts';
import { SOCIAL_BADGES } from './styles.ts';

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;|&zwj;|&shy;/gi, '')
    .replace(/&middot;/gi, '·')
    .replace(/&hellip;/gi, '…')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeChar(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');

const safeChar = (code: number): string => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
};

/** Visible text of a piece of rich HTML, with links as `label (url)` and list items as `- item`. */
export const htmlToPlainText = (html: string): string => {
  const s = html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*?\shref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const label = decodeEntities(inner.replace(/<[^>]*>/g, '')).trim();
      const url = decodeEntities(href).trim();
      return !label || label === url || !url ? label || url : `${label} (${url})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|ul|ol|tr|table)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(s)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const blockToText = (block: EmailBlock): string => {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'html':
      return htmlToPlainText(block.html);
    case 'image':
      return block.alt.trim();
    case 'button':
      return block.href.trim() ? `${block.label.trim()}: ${block.href.trim()}` : block.label.trim();
    case 'divider':
      return '----';
    case 'spacer':
      return '';
    case 'social':
      return block.items
        .filter((i) => i.url.trim())
        .map((i) => `${(SOCIAL_BADGES[i.network] ?? SOCIAL_BADGES.website).name}: ${i.url.trim()}`)
        .join('\n');
  }
};

export const renderText = (docs: (EmailDoc | null | undefined)[]): string => {
  const parts: string[] = [];
  for (const doc of docs) {
    if (!doc) continue;
    for (const row of doc.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) {
          const t = blockToText(block);
          if (t) parts.push(t);
        }
      }
    }
  }
  return parts.length ? `${parts.join('\n\n')}\n` : '';
};
