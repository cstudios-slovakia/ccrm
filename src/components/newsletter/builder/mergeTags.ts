/**
 * Merge tags (docs/NEWSLETTER.md C9). Pure.
 *
 * Syntax: `{{tag}}` or `{{tag|fallback}}`, spaces inside the braces allowed.
 *
 *   TAG_PATTERN (JS):  /\{\{\s*([A-Za-z0-9_]+)\s*(?:\|([^{}]*))?\}\}/g
 *   TAG_PATTERN (PHP): '/\{\{\s*([A-Za-z0-9_]+)\s*(?:\|([^{}]*))?\}\}/'
 *
 * The tag name is group 1, the fallback is group 2 and is trimmed (PHP: trim()).
 * For each tag, in this order:
 *   1. a non-empty value in `values`        -> the value
 *   2. a non-empty fallback                 -> the fallback
 *   3. mode 'send'                          -> '' (empty string)
 *   4. mode 'preview'                       -> the original tag text, untouched
 * In the 'html' context both the value and the fallback are escaped exactly like PHP
 * `htmlspecialchars($v, ENT_QUOTES)`: & -> &amp;  < -> &lt;  > -> &gt;  " -> &quot;  ' -> &#039;.
 * The 'text' context never escapes. A tag left untouched in preview is never escaped.
 *
 * `mergeTags.fixtures.json` holds the shared cases; the TypeScript test and the PHP test
 * (package 2A) both run all of them so the two implementations cannot drift.
 */

export type MergeContext = 'html' | 'text';
export type MergeMode = 'preview' | 'send';
export type MergeValues = Record<string, string | undefined | null>;

export type MergeTagInfo = { tag: string; label: { en: string; sk: string; hu: string }; sample: string };

/** The tags of C9. `sample` is what the builder preview shows. */
export const MERGE_TAGS: MergeTagInfo[] = [
  { tag: 'name', label: { en: 'Name', sk: 'Meno', hu: 'Név' }, sample: 'Jana Nováková' },
  { tag: 'first_name', label: { en: 'First name', sk: 'Krstné meno', hu: 'Keresztnév' }, sample: 'Jana' },
  { tag: 'company', label: { en: 'Company', sk: 'Spoločnosť', hu: 'Cég' }, sample: 'Acme s.r.o.' },
  { tag: 'email', label: { en: 'E-mail address', sk: 'E-mailová adresa', hu: 'E-mail-cím' }, sample: 'jana@example.com' },
  {
    tag: 'unsubscribe_url',
    label: { en: 'Unsubscribe link', sk: 'Odkaz na odhlásenie', hu: 'Leiratkozási hivatkozás' },
    sample: 'https://example.com/unsubscribe',
  },
  {
    tag: 'view_online_url',
    label: { en: 'View in browser link', sk: 'Odkaz na zobrazenie v prehliadači', hu: 'Megtekintés böngészőben' },
    sample: 'https://example.com/view',
  },
  { tag: 'sender_company', label: { en: 'Your company', sk: 'Vaša spoločnosť', hu: 'Az Ön cége' }, sample: 'Your company' },
  { tag: 'current_year', label: { en: 'Current year', sk: 'Aktuálny rok', hu: 'Aktuális év' }, sample: String(new Date().getFullYear()) },
];

export const KNOWN_TAG_NAMES: string[] = MERGE_TAGS.map((t) => t.tag);

/** Sample values for the builder preview, from MERGE_TAGS. */
export const sampleMergeValues = (): Record<string, string> =>
  Object.fromEntries(MERGE_TAGS.map((t) => [t.tag, t.sample]));

const TAG_SOURCE = String.raw`\{\{\s*([A-Za-z0-9_]+)\s*(?:\|([^{}]*))?\}\}`;
const newTagPattern = () => new RegExp(TAG_SOURCE, 'g');

/** Same result as PHP `htmlspecialchars($v, ENT_QUOTES)`. */
export const htmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export type ParsedTag = { raw: string; tag: string; fallback: string | null; index: number };

/** Every merge tag in `template`, in order. */
export const parseMergeTags = (template: string): ParsedTag[] => {
  const out: ParsedTag[] = [];
  for (const m of template.matchAll(newTagPattern())) {
    out.push({
      raw: m[0],
      tag: m[1],
      fallback: m[2] === undefined ? null : m[2].trim(),
      index: m.index ?? 0,
    });
  }
  return out;
};

/** The distinct tag names used in `template`, in order of first use. */
export const listMergeTags = (template: string): string[] => {
  const seen: string[] = [];
  for (const p of parseMergeTags(template)) if (!seen.includes(p.tag)) seen.push(p.tag);
  return seen;
};

/** Tag names used in `template` that are not in the C9 list. */
export const findUnknownMergeTags = (template: string): string[] =>
  listMergeTags(template).filter((t) => !KNOWN_TAG_NAMES.includes(t));

/** True when `url` is, or starts with, a merge tag (an href such as `{{unsubscribe_url}}`). */
export const isMergeTagUrl = (url: string): boolean => /^\s*\{\{[^{}]*\}\}/.test(url);

export const substituteMergeTags = (
  template: string,
  values: MergeValues,
  options: { context: MergeContext; mode: MergeMode },
): string =>
  template.replace(newTagPattern(), (raw: string, tag: string, fallbackRaw: string | undefined) => {
    const own = Object.prototype.hasOwnProperty.call(values, tag) ? values[tag] : undefined;
    const value = typeof own === 'string' ? own : '';
    const fallback = fallbackRaw === undefined ? '' : fallbackRaw.trim();
    let out: string;
    if (value !== '') out = value;
    else if (fallback !== '') out = fallback;
    else if (options.mode === 'send') out = '';
    else return raw;
    return options.context === 'html' ? htmlEscape(out) : out;
  });
