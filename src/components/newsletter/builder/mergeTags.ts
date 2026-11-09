/**
 * Merge tags (docs/NEWSLETTER.md C9). Pure. The PHP port (package 2A) is written from THIS
 * comment and `mergeTags.fixtures.json`; both implementations run every fixture.
 *
 * Syntax: `{{tag}}` or `{{tag|fallback}}`. Whitespace inside the braces is ASCII only
 * (space, tab, CR, LF); NBSP (U+00A0) and every other Unicode space is NOT whitespace.
 *
 *   TAG_PATTERN (JS):  /\{\{[ \t\r\n]*([A-Za-z0-9_]+)[ \t\r\n]*(?:\|([^{}]*))?\}\}/g
 *   TAG_PATTERN (PHP): '/\{\{[ \t\r\n]*([A-Za-z0-9_]+)[ \t\r\n]*(?:\|([^{}]*))?\}\}/'  (no /u flag)
 *
 * Never `\s` and never `String.prototype.trim()` (they differ between JS and PCRE).
 * The tag name is group 1 and is case-sensitive. The fallback is group 2, taken as written
 * and trimmed with ASCII_TRIM = the characters [ \t\r\n] (PHP: `trim($s, " \t\r\n")`); it may
 * contain pipes and anything but braces.
 *
 * For each tag, in this order:
 *   1. a non-empty value in `values` (an own key holding a string)  -> the value
 *   2. a non-empty (trimmed) fallback                               -> the fallback
 *   3. mode 'send'                                                  -> '' (empty string)
 *   4. mode 'preview'                                               -> the original tag text,
 *      untouched (never decoded, never escaped)
 *
 * Context 'text' (subject, plain-text part): value and fallback are used exactly as
 * written; no decoding, no escaping.
 *
 * Context 'html':
 *   - A VALUE (from the database) is only escaped, never decoded.
 *   - A FALLBACK was written into the e-mail by the renderer, which HTML-escapes everything
 *     it puts in attributes, <title>, the preheader and text, so the fallback is already
 *     escaped. It is first DECODED with exactly this map, in ONE pass, nothing else
 *     (PHP: `strtr($fallback, DECODE_MAP)`, case-sensitive):
 *       &amp; -> &    &lt; -> <    &gt; -> >    &quot; -> "
 *       &#039; -> '   &#39; -> '   &apos; -> '  &nbsp; -> U+00A0 (UTF-8 bytes C2 A0)
 *     and then escaped ONCE with the escape map below. A fallback is therefore never
 *     escaped twice (`Tom &amp; Jerry` stays `Tom &amp; Jerry`).
 *   - ESCAPE MAP, the same as PHP `htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE)` with
 *     double_encode = true (PHP 8.1+ writes the apostrophe as `&#039;`):
 *       & -> &amp;    < -> &lt;    > -> &gt;    " -> &quot;    ' -> &#039;
 *
 * Preview (builder, mode 'preview') and send (mode 'send') differ only in step 4: preview
 * leaves a tag that has neither a value nor a fallback visible, send empties it.
 *
 * The renderer normalises every merge tag in its output to the canonical form `{{tag}}` or
 * `{{tag|fallback}}` (`normalizeMergeTags`): inside the braces it removes ASCII whitespace,
 * U+00A0 and the literal entity `&nbsp;` around the tag name and around the `|`, and drops an
 * empty fallback. The server therefore only ever sees canonical tags (contenteditable inserts
 * NBSP, which TAG_PATTERN deliberately does not accept).
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

const TAG_SOURCE = String.raw`\{\{[ \t\r\n]*([A-Za-z0-9_]+)[ \t\r\n]*(?:\|([^{}]*))?\}\}`;
const newTagPattern = () => new RegExp(TAG_SOURCE, 'g');

/** Same result as PHP `htmlspecialchars($v, ENT_QUOTES)`. */
export const htmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/** The decode map for a fallback in the html context (PHP: `strtr`). Exactly these, nothing else. */
const FALLBACK_DECODE_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};
const FALLBACK_DECODE_PATTERN = /&(?:amp|lt|gt|quot|#039|#39|apos|nbsp);/g;

/** One pass, no re-scanning: `&amp;lt;` becomes `&lt;`, like PHP `strtr` with the same map. */
export const decodeFallbackEntities = (value: string): string =>
  value.replace(FALLBACK_DECODE_PATTERN, (m) => FALLBACK_DECODE_MAP[m]);

/** PHP `trim($s, " \t\r\n")`. Not `String.prototype.trim()`, which also strips NBSP and more. */
export const asciiTrim = (value: string): string => value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

export type ParsedTag = { raw: string; tag: string; fallback: string | null; index: number };

/** Every merge tag in `template`, in order. */
export const parseMergeTags = (template: string): ParsedTag[] => {
  const out: ParsedTag[] = [];
  for (const m of template.matchAll(newTagPattern())) {
    out.push({
      raw: m[0],
      tag: m[1],
      fallback: m[2] === undefined ? null : asciiTrim(m[2]),
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
export const isMergeTagUrl = (url: string): boolean => /^[ \t\r\n]*\{\{[^{}]*\}\}/.test(url);

/** The canonical text of a tag, what the picker inserts: `{{tag}}` or `{{tag|fallback}}`. */
export const formatMergeTag = (tag: string, fallback?: string): string => {
  const fb = fallback === undefined ? '' : asciiTrim(fallback);
  return fb ? `{{${tag}|${fb}}}` : `{{${tag}}}`;
};

const NORMALIZE_WS = String.raw`(?:[ \t\r\n ]|&nbsp;)`;
const NORMALIZE_SOURCE = String.raw`\{\{${NORMALIZE_WS}*([A-Za-z0-9_]+)${NORMALIZE_WS}*(?:\|([^{}]*))?\}\}`;
const NORMALIZE_EDGES = new RegExp(String.raw`^${NORMALIZE_WS}+|${NORMALIZE_WS}+$`, 'g');

/**
 * Rewrite every merge tag in `text` to the canonical form (see the header): removes ASCII
 * whitespace, U+00A0 and the literal `&nbsp;` inside the braces around the name and the `|`.
 * Idempotent. Text that is not a tag is left alone.
 */
export const normalizeMergeTags = (text: string): string =>
  text.replace(new RegExp(NORMALIZE_SOURCE, 'g'), (_raw: string, tag: string, fallback: string | undefined) =>
    formatMergeTag(tag, fallback === undefined ? undefined : fallback.replace(NORMALIZE_EDGES, '')),
  );

export const substituteMergeTags = (
  template: string,
  values: MergeValues,
  options: { context: MergeContext; mode: MergeMode },
): string =>
  template.replace(newTagPattern(), (raw: string, tag: string, fallbackRaw: string | undefined) => {
    const own = Object.prototype.hasOwnProperty.call(values, tag) ? values[tag] : undefined;
    const value = typeof own === 'string' ? own : '';
    const fallback = fallbackRaw === undefined ? '' : asciiTrim(fallbackRaw);
    const html = options.context === 'html';
    if (value !== '') return html ? htmlEscape(value) : value;
    if (fallback !== '') return html ? htmlEscape(decodeFallbackEntities(fallback)) : fallback;
    return options.mode === 'send' ? '' : raw;
  });
