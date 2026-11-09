/**
 * Defaults and factories for the e-mail document (docs/NEWSLETTER.md C3, C6). Pure.
 * Every visible default text exists in en, sk and hu.
 */
import type {
  BlockType,
  CompanyInfo,
  EmailBlock,
  EmailColumn,
  EmailDoc,
  EmailRow,
  NewsletterTheme,
  RowLayout,
  SocialNetwork,
} from './types.ts';
import { htmlEscape } from './mergeTags.ts';

export const THEME_DEFAULTS: NewsletterTheme = {
  contentWidth: 600,
  pageBackground: '#f1f5f9',
  contentBackground: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  textColor: '#1e293b',
  linkColor: '#2563eb',
  buttonBackground: '#2563eb',
  buttonTextColor: '#ffffff',
};

/** Web-safe font stacks the theme can use (the stack is the stored value). */
export const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
];

export const CONTENT_WIDTH_MIN = 520;
export const CONTENT_WIDTH_MAX = 800;

export const ROW_LAYOUTS: RowLayout[] = ['1', '1-1', '1-2', '2-1', '1-1-1'];

/** Column width ratios per layout. */
export const LAYOUT_RATIOS: Record<RowLayout, number[]> = {
  '1': [1],
  '1-1': [1, 1],
  '1-2': [1, 2],
  '2-1': [2, 1],
  '1-1-1': [1, 1, 1],
};

export const BLOCK_TYPES: BlockType[] = ['text', 'heading', 'image', 'button', 'divider', 'spacer', 'social', 'html'];

export const SOCIAL_NETWORKS: SocialNetwork[] = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'website'];

export const newId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
};

type Lang = 'en' | 'sk' | 'hu';
const pick = (lang: string, en: string, sk: string, hu: string): string => (lang === 'sk' ? sk : lang === 'hu' ? hu : en);
export const normalizeLang = (lang: string): Lang => (lang === 'sk' || lang === 'hu' ? lang : 'en');

export const newColumn = (): EmailColumn => ({ id: newId(), blocks: [] });

export const newRow = (layout: RowLayout = '1'): EmailRow => ({
  id: newId(),
  layout,
  columns: LAYOUT_RATIOS[layout].map(() => newColumn()),
});

export const newBlock = (type: BlockType, lang = 'en'): EmailBlock => {
  const id = newId();
  switch (type) {
    case 'text':
      return { id, type, html: `<p>${pick(lang, 'Write your text here.', 'Sem napíšte text.', 'Írja ide a szöveget.')}</p>` };
    case 'heading':
      return { id, type, level: 2, html: pick(lang, 'Your heading', 'Váš nadpis', 'Az Ön címsora') };
    case 'image':
      return { id, type, src: '', alt: '' };
    case 'button':
      return { id, type, label: pick(lang, 'Click here', 'Kliknite sem', 'Kattintson ide'), href: 'https://', align: 'center' };
    case 'divider':
      return { id, type };
    case 'spacer':
      return { id, type, height: 24 };
    case 'social':
      return {
        id,
        type,
        align: 'center',
        items: [
          { network: 'facebook', url: '' },
          { network: 'instagram', url: '' },
          { network: 'linkedin', url: '' },
        ],
      };
    case 'html':
      return { id, type, html: '<p style="margin:0">HTML</p>' };
  }
};

const rowWith = (layout: RowLayout, blocks: EmailBlock[][]): EmailRow => {
  const row = newRow(layout);
  row.columns.forEach((c, i) => {
    c.blocks = blocks[i] ?? [];
  });
  return row;
};

/** The three starters of the empty-document screen. */
export type StarterKind = 'text' | 'imageText' | 'twoColumns';
export const newStarterRow = (kind: StarterKind, lang = 'en'): EmailRow => {
  if (kind === 'text') return rowWith('1', [[newBlock('text', lang)]]);
  if (kind === 'imageText') return rowWith('1-1', [[newBlock('image', lang)], [newBlock('heading', lang), newBlock('text', lang)]]);
  return rowWith('1-1', [[newBlock('text', lang)], [newBlock('text', lang)]]);
};

export const emptyDoc = (): EmailDoc => ({ version: 1, rows: [] });

/** A starting body for a new campaign. */
export const defaultBody = (lang = 'en'): EmailDoc => {
  const heading = newBlock('heading', lang);
  if (heading.type === 'heading') {
    heading.html = pick(lang, 'Hello {{first_name|there}},', 'Dobrý deň {{first_name|vážený klient}},', 'Kedves {{first_name|Ügyfelünk}}!');
    heading.level = 1;
  }
  const text = newBlock('text', lang);
  if (text.type === 'text') {
    text.html = `<p>${pick(
      lang,
      'Write your message here. Select the text to format it, add links and merge tags.',
      'Sem napíšte správu. Označte text, aby ste ho naformátovali, pridali odkazy a polia.',
      'Írja ide az üzenetet. Jelölje ki a szöveget a formázáshoz, hivatkozások és mezők beszúrásához.',
    )}</p>`;
  }
  return { version: 1, rows: [rowWith('1', [[heading, text, newBlock('button', lang)]])] };
};

/** Global header: the logo when there is one, otherwise the company name. */
export const defaultHeader = (company: CompanyInfo, lang = 'en'): EmailDoc => {
  const blocks: EmailBlock[] = [];
  if (company.logoUrl) {
    blocks.push({ id: newId(), type: 'image', src: company.logoUrl, alt: company.name, width: 160, align: 'center' });
  } else {
    blocks.push({ id: newId(), type: 'heading', level: 2, align: 'center', html: htmlEscape(company.name || pick(lang, 'Your company', 'Vaša spoločnosť', 'Az Ön cége')) });
  }
  const row = rowWith('1', [blocks]);
  row.paddingTop = 24;
  row.paddingBottom = 8;
  return { version: 1, rows: [row] };
};

/** Global footer: reason, company name and address, unsubscribe and view-in-browser links. */
export const defaultFooter = (company: CompanyInfo, lang = 'en'): EmailDoc => {
  const name = htmlEscape(company.name || pick(lang, 'Your company', 'Vaša spoločnosť', 'Az Ön cége'));
  const address = (company.address ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(htmlEscape)
    .join('<br>');
  const reason = pick(
    lang,
    `You are receiving this e-mail because you are in the contact list of ${name}.`,
    `Tento e-mail dostávate, pretože ste v zozname kontaktov spoločnosti ${name}.`,
    `Ezt az e-mailt azért kapja, mert szerepel a(z) ${name} kapcsolatai között.`,
  );
  const unsub = pick(lang, 'Unsubscribe', 'Odhlásiť odber', 'Leiratkozás');
  const view = pick(lang, 'View in browser', 'Zobraziť v prehliadači', 'Megtekintés böngészőben');
  const text: EmailBlock = {
    id: newId(),
    type: 'text',
    align: 'center',
    fontSize: 12,
    color: '#64748b',
    html:
      `<p>${reason}</p>` +
      `<p>${name}${address ? `<br>${address}` : ''}</p>` +
      `<p><a href="{{unsubscribe_url}}">${unsub}</a> ·<a href="{{view_online_url}}">${view}</a></p>`,
  };
  const row = rowWith('1', [[text]]);
  row.paddingTop = 8;
  row.paddingBottom = 24;
  row.contentBackground = 'transparent';
  return { version: 1, rows: [row] };
};
