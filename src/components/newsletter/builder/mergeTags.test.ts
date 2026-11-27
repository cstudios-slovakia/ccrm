import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MERGE_TAGS,
  asciiTrim,
  decodeFallbackEntities,
  findUnknownMergeTags,
  formatMergeTag,
  htmlEscape,
  isMergeTagUrl,
  listMergeTags,
  normalizeMergeTags,
  parseMergeTags,
  sampleMergeValues,
  substituteMergeTags,
  type MergeContext,
  type MergeMode,
  type MergeValues,
} from './mergeTags.ts';

type Case = { name: string; template: string; values: MergeValues; context: MergeContext; mode: MergeMode; expected: string };

const cases: Case[] = JSON.parse(readFileSync(new URL('./mergeTags.fixtures.json', import.meta.url), 'utf8'));

test('the fixture file has the cases the PHP port relies on', () => {
  assert.ok(cases.length >= 12);
  for (const c of cases) {
    assert.equal(typeof c.name, 'string');
    assert.ok(c.context === 'html' || c.context === 'text', c.name);
    assert.ok(c.mode === 'preview' || c.mode === 'send', c.name);
  }
  assert.equal(new Set(cases.map((c) => c.name)).size, cases.length, 'case names are unique');
});

for (const c of cases) {
  test(`merge fixture: ${c.name}`, () => {
    assert.equal(substituteMergeTags(c.template, c.values, { context: c.context, mode: c.mode }), c.expected);
  });
}

test('htmlEscape matches PHP htmlspecialchars ENT_QUOTES', () => {
  assert.equal(htmlEscape(`&<>"'`), '&amp;&lt;&gt;&quot;&#039;');
  assert.equal(htmlEscape('plain'), 'plain');
});

test('parseMergeTags and listMergeTags', () => {
  const tpl = 'a {{first_name|there}} b {{ email }} c {{first_name}}';
  const parsed = parseMergeTags(tpl);
  assert.deepEqual(parsed.map((p) => [p.tag, p.fallback]), [['first_name', 'there'], ['email', null], ['first_name', null]]);
  assert.equal(tpl.slice(parsed[1].index, parsed[1].index + parsed[1].raw.length), '{{ email }}');
  assert.deepEqual(listMergeTags(tpl), ['first_name', 'email']);
});

test('findUnknownMergeTags ignores the C9 tags', () => {
  assert.deepEqual(findUnknownMergeTags('{{first_name}} {{coupon}} {{ nope | x }} {{coupon}}'), ['coupon', 'nope']);
  assert.deepEqual(findUnknownMergeTags('{{unsubscribe_url}}'), []);
});

test('isMergeTagUrl', () => {
  assert.equal(isMergeTagUrl('{{unsubscribe_url}}'), true);
  assert.equal(isMergeTagUrl('  {{ view_online_url | https://x.test }}'), true);
  assert.equal(isMergeTagUrl('https://x.test/{{name}}'), false);
});

test('asciiTrim strips [ \\t\\r\\n] only', () => {
  assert.equal(asciiTrim(' \t\r\n a b \n'), 'a b');
  assert.equal(asciiTrim(' a '), ' a ');
  assert.equal(asciiTrim('\u000ba\u000c'), '\u000ba\u000c');
});

test('decodeFallbackEntities: exactly the documented map, one pass', () => {
  assert.equal(decodeFallbackEntities('&amp;&lt;&gt;&quot;&#039;&#39;&apos;&nbsp;'), `&<>"''' `);
  assert.equal(decodeFallbackEntities('&amp;lt;'), '&lt;');
  assert.equal(decodeFallbackEntities('&AMP; &#169; &copy; &#x26; &amp'), '&AMP; &#169; &copy; &#x26; &amp');
});

test('formatMergeTag is canonical', () => {
  assert.equal(formatMergeTag('first_name'), '{{first_name}}');
  assert.equal(formatMergeTag('first_name', ' there '), '{{first_name|there}}');
  assert.equal(formatMergeTag('first_name', '  '), '{{first_name}}');
});

test('normalizeMergeTags removes ASCII spaces, NBSP and &nbsp; around the name and the pipe', () => {
  assert.equal(normalizeMergeTags('{{ first_name }}'), '{{first_name}}');
  assert.equal(normalizeMergeTags('{{&nbsp;first_name }}'), '{{first_name}}');
  assert.equal(normalizeMergeTags('{{ first_name }}'), '{{first_name}}');
  assert.equal(normalizeMergeTags('{{ \t&nbsp; first_name\r\n&nbsp;|&nbsp; there  &nbsp;}}'), '{{first_name|there}}');
  assert.equal(normalizeMergeTags('{{x|a | b}}'), '{{x|a | b}}', 'only the edges of the fallback are trimmed');
  assert.equal(normalizeMergeTags('{{x|&nbsp;}} {{y| }}'), '{{x}} {{y}}', 'an empty fallback is dropped');
  assert.equal(normalizeMergeTags('a {{ first_name }} b {{email}} c'), 'a {{first_name}} b {{email}} c');
  assert.equal(normalizeMergeTags('{{ first name }} {{}} {x}'), '{{ first name }} {{}} {x}', 'not a tag, not touched');
  const once = normalizeMergeTags('{{&nbsp;a | b }}');
  assert.equal(normalizeMergeTags(once), once, 'idempotent');
});

test('the substituted result of a normalised tag equals the one of the original (spaces only)', () => {
  const values = { first_name: 'Jana' };
  const tpl = '{{ first_name | x }}';
  assert.equal(
    substituteMergeTags(normalizeMergeTags(tpl), values, { context: 'html', mode: 'send' }),
    substituteMergeTags(tpl, values, { context: 'html', mode: 'send' }),
  );
});

test('MERGE_TAGS lists every C9 tag with en, sk and hu labels', () => {
  assert.deepEqual(
    MERGE_TAGS.map((t) => t.tag),
    ['name', 'first_name', 'company', 'email', 'unsubscribe_url', 'view_online_url', 'sender_company', 'current_year'],
  );
  for (const t of MERGE_TAGS) {
    assert.ok(t.label.en && t.label.sk && t.label.hu, t.tag);
  }
  assert.equal(Object.keys(sampleMergeValues()).length, MERGE_TAGS.length);
});
