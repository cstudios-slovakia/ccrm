import test from 'node:test';
import assert from 'node:assert/strict';
import type { EmailBlock, EmailDoc, EmailRow, RenderInput } from './types.ts';
import { renderEmail } from './renderEmail.ts';
import { renderText, htmlToPlainText } from './renderText.ts';
import { THEME_DEFAULTS, defaultFooter, defaultHeader } from './defaults.ts';
import { SOCIAL_BADGES, alignOf, cssText, columnWidths, decorateRichHtml, absoluteUrl, isDangerousUrl, isValidLinkUrl, safeColor, safeTheme } from './styles.ts';
import { substituteMergeTags } from './mergeTags.ts';

const row = (layout: EmailRow['layout'], columns: EmailBlock[][], extra: Partial<EmailRow> = {}): EmailRow => ({
  id: 'r',
  layout,
  columns: columns.map((blocks, i) => ({ id: `c${i}`, blocks })),
  ...extra,
});
const doc = (...rows: EmailRow[]): EmailDoc => ({ version: 1, rows });
const text = (id: string, html: string): EmailBlock => ({ id, type: 'text', html });
const unsub: EmailBlock = { id: 'u', type: 'text', html: '<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' };

const input = (body: EmailDoc, extra: Partial<RenderInput> = {}): RenderInput => ({
  body,
  footer: doc(row('1', [[unsub]])),
  theme: THEME_DEFAULTS,
  subject: 'Hello',
  assetBaseUrl: 'https://crm.example.com',
  lang: 'en',
  ...extra,
});
const codes = (r: ReturnType<typeof renderEmail>) => r.warnings.map((w) => w.code);

test('document skeleton: doctype, lang, charset, viewport, meta, title', () => {
  const { html } = renderEmail(input(doc(row('1', [[text('a', '<p>Hi</p>')]])), { subject: 'Tom & "Jerry" <b>', lang: 'sk' }));
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<html lang="sk"/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<meta name="x-apple-disable-message-reformatting">/);
  assert.match(html, /<meta name="color-scheme" content="light">/);
  assert.match(html, /<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;<\/title>/);
  assert.equal((html.match(/<style>/g) ?? []).length, 1, 'one style block');
});

test('a bad lang falls back to en', () => {
  assert.match(renderEmail(input(doc(), { lang: '"><script>' })).html, /<html lang="en"/);
});

test('hidden preheader right after <body>, escaped, with zwnj/nbsp padding; none when empty', () => {
  const r = renderEmail(input(doc(row('1', [[text('a', '<p>Hi</p>')]])), { preheader: 'Big <news>' }));
  const afterBody = r.html.slice(r.html.indexOf('<body'));
  const bodyTagEnd = afterBody.indexOf('>') + 1;
  assert.ok(afterBody.slice(bodyTagEnd).trimStart().startsWith('<div style="display:none'));
  assert.match(r.html, /Big &lt;news&gt;(?:&zwnj;&nbsp;){10,}<\/div>/);
  assert.ok(!renderEmail(input(doc())).html.includes('display:none'));
});

test('layout: outer table in the page background, a content table of contentWidth', () => {
  const theme = { ...THEME_DEFAULTS, contentWidth: 640, pageBackground: '#112233' };
  const { html } = renderEmail(input(doc(row('1', [[text('a', '<p>Hi</p>')]])), { theme }));
  assert.match(html, /<table[^>]*width="100%"[^>]*bgcolor="#112233"/);
  assert.match(html, /width="640"[^>]*style="width:100%;max-width:640px;/);
  assert.match(html, /@media only screen and \(max-width:660px\)\{\.nl-col\{display:block!important;width:100%!important;max-width:100%!important\}\}/);
});

test('multi-column rows use Outlook ghost tables and fluid columns that stack', () => {
  const { html } = renderEmail(input(doc(row('1-2', [[text('a', '<p>L</p>')], [text('b', '<p>R</p>')]]))));
  assert.match(html, /<!--\[if mso\]><table[^>]*width="600"><tr><td width="200" valign="top"><!\[endif\]-->/);
  assert.match(html, /<!--\[if mso\]><\/td><td width="400" valign="top"><!\[endif\]-->/);
  assert.match(html, /<!--\[if mso\]><\/td><\/tr><\/table><!\[endif\]-->/);
  assert.equal((html.match(/class="nl-col"/g) ?? []).length, 2);
  assert.match(html, /class="nl-col" style="display:inline-block;width:100%;max-width:200px;/);
  assert.match(html, /max-width:400px;/);
});

test('a single column row needs no ghost table; stackOnMobile false uses plain table cells', () => {
  const single = renderEmail(input(doc(row('1', [[text('a', '<p>x</p>')]])))).html;
  assert.ok(!single.includes('<!--[if mso]><table'));
  assert.ok(!single.includes('class="nl-col"'));
  const fixed = renderEmail(input(doc(row('1-1', [[text('a', '<p>L</p>')], [text('b', '<p>R</p>')]], { stackOnMobile: false })))).html;
  assert.ok(!fixed.includes('class="nl-col"'));
  assert.ok(!fixed.includes('<!--[if mso]><table'));
  assert.match(fixed, /<td width="300" valign="top"/);
});

test('three columns split the width exactly', () => {
  assert.deepEqual(columnWidths('1-1-1', 640), [213, 213, 214]);
  assert.deepEqual(columnWidths('2-1', 600), [400, 200]);
  assert.deepEqual(columnWidths('1', 600), [600]);
});

test('row backgrounds, paddings and column padding', () => {
  const { html } = renderEmail(
    input(
      doc(
        row('1', [[text('a', '<p>x</p>')]], { background: '#eeeeee', contentBackground: '#ff0000', paddingTop: 5, paddingBottom: 0 }),
      ),
    ),
  );
  assert.match(html, /bgcolor="#eeeeee"/);
  assert.match(html, /bgcolor="#ff0000"[^>]*style="width:100%;max-width:600px;background-color:#ff0000;"/);
  assert.match(html, /padding:5px 0 0px 0;/);
  assert.match(html, /<td [^>]*style="width:100%;padding:0 16px;vertical-align:top">/);
});

test('text block: theme font, size, line height, colour, alignment, paragraph spacing, link colour', () => {
  const b: EmailBlock = { id: 't', type: 'text', html: '<p>One</p><p>Two <a href="https://x.test">link</a></p>', align: 'center', fontSize: 18, color: '#112233', lineHeight: 1.7 };
  const { html } = renderEmail(input(doc(row('1', [[b]]))));
  assert.match(html, /align="center" style="padding:8px 0;font-family:Arial, Helvetica, sans-serif;font-size:18px;line-height:1.7;color:#112233;text-align:center"/);
  assert.ok(html.includes('<p style="margin:0 0 12px">One</p>'));
  assert.ok(html.includes('<p style="margin:0">Two '), 'the last paragraph has no bottom margin');
  assert.ok(html.includes('<a href="https://x.test" style="color:#2563eb;text-decoration:underline">link</a>'));
});

test('decorateRichHtml leaves anchors that already have a style alone', () => {
  const out = decorateRichHtml('<a href="#" style="color:red">x</a>', THEME_DEFAULTS);
  assert.equal(out, '<a href="#" style="color:red">x</a>');
});

test('heading block', () => {
  const { html } = renderEmail(input(doc(row('1', [[{ id: 'h', type: 'heading', level: 1, html: 'Big <strong>news</strong>', align: 'right', color: '#abcdef' }]]))));
  assert.match(html, /<h1 style="margin:0;font-family:Arial, Helvetica, sans-serif;font-size:28px;line-height:1.25;font-weight:bold;color:#abcdef;text-align:right">Big <strong>news<\/strong><\/h1>/);
});

test('image: width attribute, responsive style, absolute URL, alt, link', () => {
  const imgs: EmailBlock[] = [
    { id: 'i1', type: 'image', src: '/uploads/a.png', alt: 'A "pic"', width: 200, href: 'https://x.test/?a=1&b=2' },
    { id: 'i2', type: 'image', src: 'uploads/b.png', alt: 'B' },
    { id: 'i3', type: 'image', src: 'https://cdn.test/c.png', alt: 'C', width: 9999 },
  ];
  const { html, warnings } = renderEmail(input(doc(row('1', [imgs]))));
  assert.ok(html.includes('<img src="https://crm.example.com/uploads/a.png" alt="A &quot;pic&quot;" width="200" style="display:block;max-width:100%;height:auto;border:0">'));
  assert.ok(html.includes('<a href="https://x.test/?a=1&amp;b=2" target="_blank"'));
  assert.ok(html.includes('src="https://crm.example.com/uploads/b.png" alt="B" width="568"'), 'default width = column width minus padding');
  assert.ok(html.includes('src="https://cdn.test/c.png" alt="C" width="568"'), 'too wide is clamped');
  assert.deepEqual(warnings.map((w) => w.code), []);
});

test('image alt="" is kept in the markup and warned about', () => {
  const r = renderEmail(input(doc(row('1', [[{ id: 'i', type: 'image', src: 'https://x.test/a.png', alt: '' }]]))));
  assert.ok(r.html.includes('alt=""'));
  const w = r.warnings.find((x) => x.code === 'image_no_alt');
  assert.ok(w && w.blockId === 'i' && w.level === 'warning');
});

test('image in a narrow column is limited to the column inner width', () => {
  const r = renderEmail(input(doc(row('1-2', [[{ id: 'i', type: 'image', src: 'https://x.test/a.png', alt: 'a' }], []]))));
  assert.ok(r.html.includes('width="168"'), '200 - 2*16');
});

test('data: image is an error and an empty src is skipped with a warning', () => {
  const r = renderEmail(input(doc(row('1', [[
    { id: 'd', type: 'image', src: 'data:image/png;base64,AAAA', alt: 'x' },
    { id: 'e', type: 'image', src: '', alt: 'x' },
  ]]))));
  const err = r.warnings.find((w) => w.code === 'data_url_image');
  assert.ok(err && err.level === 'error' && err.blockId === 'd');
  assert.ok(r.warnings.some((w) => w.code === 'image_no_src' && w.blockId === 'e'));
});

test('button: bulletproof table cell with background on the td, padding on the a', () => {
  const b: EmailBlock = { id: 'b', type: 'button', label: 'Buy <now>', href: 'https://x.test/p?a=1&b=2', align: 'right', background: '#ff0000', color: '#00ff00', radius: 12 };
  const { html } = renderEmail(input(doc(row('1', [[b]]))));
  assert.ok(html.includes('<td align="center" bgcolor="#ff0000" style="background-color:#ff0000;border-radius:12px">'));
  assert.ok(html.includes('<a href="https://x.test/p?a=1&amp;b=2" target="_blank" style="display:inline-block;padding:12px 24px;'));
  assert.ok(html.includes('color:#00ff00;text-decoration:none;border-radius:12px;'));
  assert.ok(html.includes('>Buy &lt;now&gt;</a>'));
  assert.match(html, /<table [^>]*align="right"><tr><td align="center" bgcolor/);
});

test('button: theme colours as defaults, full width', () => {
  const { html } = renderEmail(input(doc(row('1', [[{ id: 'b', type: 'button', label: 'Go', href: 'https://x.test', fullWidth: true }]]))));
  assert.ok(html.includes('bgcolor="#2563eb"'));
  assert.ok(html.includes('display:block;padding:12px 24px'));
  assert.ok(html.includes('color:#ffffff;'));
});

test('divider, spacer, html block and social badges', () => {
  const blocks: EmailBlock[] = [
    { id: 'd', type: 'divider', color: '#ff00ff', thickness: 3, widthPercent: 50 },
    { id: 's', type: 'spacer', height: 40 },
    { id: 'h', type: 'html', html: '<p class="raw" style="color:red">raw</p>' },
    { id: 'so', type: 'social', align: 'left', items: [{ network: 'facebook', url: 'https://f.test' }, { network: 'linkedin', url: 'https://l.test' }, { network: 'website', url: '' }] },
  ];
  const r = renderEmail(input(doc(row('1', [blocks]))));
  assert.ok(r.html.includes('border-top:3px solid #ff00ff'));
  assert.ok(r.html.includes('width="50%"'));
  assert.ok(r.html.includes('height="40" style="height:40px;font-size:40px;line-height:40px"'));
  assert.ok(r.html.includes('<p class="raw" style="color:red">raw</p>'), 'html block is raw');
  assert.ok(r.html.includes('bgcolor="#1877f2"') && r.html.includes('>f</a>'));
  assert.ok(r.html.includes('bgcolor="#0a66c2"') && r.html.includes('>in</a>'));
  assert.ok(r.html.includes('border-radius:50%'));
  assert.ok(r.html.includes('href="https://f.test"'));
  assert.ok(!r.html.includes('>www</a>'), 'an item without a URL is skipped');
  assert.ok(r.warnings.some((w) => w.code === 'bad_url' && w.blockId === 'so'));
});

test('every attribute value is escaped', () => {
  const b: EmailBlock = { id: 'i', type: 'image', src: 'https://x.test/a.png?x="><script>', alt: '" onerror="x', href: '"><b>' };
  const { html } = renderEmail(input(doc(row('1', [[b]]))));
  assert.ok(!html.includes('"><script>'));
  assert.ok(!html.includes('onerror="x'));
  assert.ok(html.includes('alt="&quot; onerror=&quot;x"'));
});

test('merge-tag URLs stay as they are', () => {
  const blocks: EmailBlock[] = [
    { id: 'b', type: 'button', label: 'View', href: '{{view_online_url}}' },
    { id: 'i', type: 'image', src: '{{company}}', alt: 'x', href: '{{ unsubscribe_url }}' },
  ];
  const r = renderEmail(input(doc(row('1', [blocks]))));
  assert.ok(r.html.includes('<a href="{{view_online_url}}" target="_blank"'));
  assert.ok(r.html.includes('src="{{company}}"'));
  assert.ok(r.html.includes('href="{{unsubscribe_url}}"'), 'a tag with spaces is output in the canonical form');
  assert.ok(!r.warnings.some((w) => w.code === 'bad_url'));
  const sent = substituteMergeTags(r.html, { view_online_url: 'https://x.test/v?a=1&t=2' }, { context: 'html', mode: 'send' });
  assert.ok(sent.includes('<a href="https://x.test/v?a=1&amp;t=2" target="_blank"'));
});

test('header and footer render around the body, in order', () => {
  const r = renderEmail(input(doc(row('1', [[text('b', '<p>BODY</p>')]])), {
    header: doc(row('1', [[text('h', '<p>HEADER</p>')]])),
    footer: doc(row('1', [[text('f', '<p>FOOTER</p>'), unsub]])),
  }));
  const [h, b, f] = ['HEADER', 'BODY', 'FOOTER'].map((s) => r.html.indexOf(s));
  assert.ok(h > 0 && h < b && b < f);
  assert.deepEqual(r.text.split('\n\n').slice(0, 3), ['HEADER', 'BODY', 'FOOTER']);
});

test('the default header and footer render and satisfy the unsubscribe check', () => {
  const company = { name: 'Acme', address: 'Main 1\nBratislava' };
  const r = renderEmail(input(doc(row('1', [[text('b', '<p>Hi</p>')]])), { header: defaultHeader(company), footer: defaultFooter(company) }));
  assert.deepEqual(codes(r), []);
  assert.ok(r.text.includes('Unsubscribe ({{unsubscribe_url}})'));
  assert.ok(r.text.includes('View in browser ({{view_online_url}})'));
  assert.ok(r.text.includes('Main 1\nBratislava'));
});

// ---- warnings ---------------------------------------------------------------------------

test('warning missing_unsubscribe (error): none anywhere; spaces and fallback in the tag still count', () => {
  const noLink = renderEmail({ ...input(doc(row('1', [[text('a', '<p>Hi</p>')]]))), footer: null });
  const w = noLink.warnings.find((x) => x.code === 'missing_unsubscribe');
  assert.ok(w && w.level === 'error' && w.message.en && w.message.sk && w.message.hu);
  assert.ok(!codes(renderEmail(input(doc(row('1', [[text('a', '<p>Hi</p>')]]))))).includes('missing_unsubscribe'));
  const spaced = renderEmail({ ...input(doc(row('1', [[{ id: 'b', type: 'button', label: 'x', href: '{{ unsubscribe_url | https://x.test }}' }]]))), footer: null });
  assert.ok(!codes(spaced).includes('missing_unsubscribe'));
});

test('warning button_no_href', () => {
  const r = renderEmail(input(doc(row('1', [[{ id: 'b', type: 'button', label: 'x', href: '  ' }]]))));
  assert.ok(r.warnings.some((w) => w.code === 'button_no_href' && w.blockId === 'b'));
  assert.ok(!codes(r).includes('bad_url'));
});

test('warning empty_body', () => {
  assert.ok(codes(renderEmail(input(doc()))).includes('empty_body'));
  assert.ok(codes(renderEmail(input(doc(row('1', [[]]))))).includes('empty_body'));
  assert.ok(!codes(renderEmail(input(doc(row('1', [[text('a', '<p>x</p>')]]))))).includes('empty_body'));
});

test('warning unknown_merge_tag: per block, subject and preheader', () => {
  const r = renderEmail(input(doc(row('1', [[text('a', '<p>Hi {{first_name}} {{coupon}}</p>'), { id: 'b', type: 'button', label: '{{voucher|x}}', href: 'https://x.test' }]])), {
    subject: 'Hello {{nope}}',
    preheader: '{{first_name}}',
  }));
  const unknown = r.warnings.filter((w) => w.code === 'unknown_merge_tag');
  assert.deepEqual(unknown.map((w) => w.blockId ?? '-'), ['a', 'b', '-']);
  assert.ok(unknown[0].message.en.includes('{{coupon}}'));
});

test('warning bad_url: not http(s), mailto, tel or a merge tag', () => {
  const r = renderEmail(input(doc(row('1', [[
    { id: 'b1', type: 'button', label: 'x', href: 'javascript:alert(1)' },
    { id: 'b2', type: 'button', label: 'x', href: 'www.example.com' },
    { id: 'b3', type: 'button', label: 'x', href: 'mailto:a@b.test' },
    { id: 'b4', type: 'button', label: 'x', href: 'tel:+421900000000' },
    { id: 'b5', type: 'button', label: 'x', href: 'https://ok.test' },
    text('t', '<p><a href="ftp://x.test">f</a> <a href="https://ok.test">ok</a></p>'),
  ]]))));
  assert.deepEqual(r.warnings.filter((w) => w.code === 'bad_url').map((w) => w.blockId), ['b2', 't']);
  assert.deepEqual(r.warnings.filter((w) => w.code === 'dangerous_url').map((w) => w.blockId), ['b1']);
  assert.equal(isValidLinkUrl('HTTP://x.test'), true);
  assert.equal(isValidLinkUrl('http://'), false);
});

// ---- dangerous URLs ---------------------------------------------------------------------

const buttonHtml = (href: string) => {
  const r = renderEmail(input(doc(row('1', [[{ id: 'b', type: 'button', label: 'x', href }]]))));
  return { ...r, a: /<a href="([^"]*)" target="_blank"/.exec(r.html)?.[1] };
};

test('dangerous_url: javascript:, vbscript: and data: are an error and the output href is #', () => {
  for (const href of [
    'javascript:alert(1)',
    '  JaVa\tScRiPt:alert(1)',
    '\u0001\u0007javascript:alert(1)',
    'java\nscript:alert(1)',
    'vbscript:msgbox(1)',
    'DATA:text/html,<script>alert(1)</script>',
    '{{view_online_url|javascript:alert(1)}}',
    '{{ view_online_url | \tJAVASCRIPT:alert(1) }}',
    '{{view_online_url|data:text/html,x}}',
    '{{view_online_url}}javascript:alert(1)',
  ]) {
    const r = buttonHtml(href);
    const w = r.warnings.find((x) => x.code === 'dangerous_url');
    assert.ok(w && w.level === 'error' && w.blockId === 'b' && w.message.en && w.message.sk && w.message.hu, href);
    assert.ok(!r.warnings.some((x) => x.code === 'bad_url'), `${href}: only the error, not bad_url as well`);
    assert.equal(r.a, '#', href);
    assert.ok(!/javascript:|vbscript:|data:text/i.test(r.html.replace(/<!--[\s\S]*?-->/g, '')), href);
  }
});

test('dangerous_url: image link, social link and links inside text and heading html', () => {
  const r = renderEmail(input(doc(row('1', [[
    { id: 'i', type: 'image', src: 'https://x.test/a.png', alt: 'a', href: 'javascript:alert(1)' },
    { id: 'so', type: 'social', items: [{ network: 'facebook', url: 'vbscript:x' }] },
    text('t1', '<p><a href="javascript:alert(1)">a</a> <a href=\'JavaScript:alert(2)\'>b</a> <a href=javascript:alert(3)>c</a></p>'),
    text('t2', '<p><a href="&#106;avascript&colon;alert(1)">a</a></p>'),
    text('t3', '<p><a title=">" href="data:text/html,x">a</a></p>'),
    { id: 'h', type: 'heading', level: 2, html: '<a href="javascript:alert(1)">h</a>' },
    text('ok', '<p><a href="https://ok.test/?a=1&amp;b=2">ok</a></p>'),
  ]]))));
  assert.deepEqual(r.warnings.filter((w) => w.code === 'dangerous_url').map((w) => w.blockId), ['i', 'so', 't1', 't1', 't1', 't2', 't3', 'h']);
  assert.ok(!/javascript|vbscript|data:text/i.test(r.html), 'no dangerous scheme is left in the output');
  assert.ok(r.html.includes('href="https://ok.test/?a=1&amp;b=2"'));
  assert.equal((r.html.match(/href="#"/g) ?? []).length, 8);
});

test('dangerous_url: a harmless merge-tag fallback is fine; other bad fallbacks stay bad_url', () => {
  const ok = buttonHtml('{{ view_online_url | https://ok.test/?a=1&b=2 }}');
  assert.deepEqual(codes(ok), []);
  assert.equal(ok.a, '{{view_online_url|https://ok.test/?a=1&amp;b=2}}');
  assert.equal(buttonHtml('{{view_online_url|mailto:a@b.test}}').warnings.length, 0);
  assert.equal(buttonHtml('{{view_online_url}}').warnings.length, 0);
  for (const href of ['{{view_online_url|ftp://x.test}}', '{{view_online_url|www.example.com}}', 'ftp://x.test', 'www.example.com']) {
    const r = buttonHtml(href);
    assert.deepEqual(codes(r), ['bad_url'], href);
    assert.notEqual(r.a, '#', href);
  }
  // A tag later in the URL has no say over the scheme.
  assert.deepEqual(codes(buttonHtml('https://x.test/?n={{first_name|javascript}}')), []);
});

test('isDangerousUrl and isValidLinkUrl', () => {
  assert.equal(isDangerousUrl('https://x.test'), false);
  assert.equal(isDangerousUrl('mailto:a@b.test'), false);
  assert.equal(isDangerousUrl('{{unsubscribe_url}}'), false);
  assert.equal(isDangerousUrl('/data:foo'), false);
  assert.equal(isDangerousUrl(' \tjavascript:1'), true);
  assert.equal(isDangerousUrl('{{x|javascript:1}}'), true);
  assert.equal(isValidLinkUrl('{{x|https://ok.test}}'), true);
  assert.equal(isValidLinkUrl('{{x|javascript:1}}'), false);
  assert.equal(isValidLinkUrl('{{x|ftp://a.test}}'), false);
  assert.equal(isValidLinkUrl('{{x|}}'), true);
});

// ---- hostile values from the document ---------------------------------------------------

test('hostile colours, enums and theme values never reach an attribute or the <style> block raw', () => {
  const evil = 'red" onmouseover="x';
  const theme = {
    ...THEME_DEFAULTS,
    linkColor: 'red}</style><script>alert(1)</script>',
    pageBackground: evil,
    contentBackground: 'red;background:url(//evil.test/x)',
    textColor: 'expression(alert(1))',
    buttonBackground: '"><script>',
    buttonTextColor: 'rgb(1,2,3);x',
    fontFamily: 'Arial;}</style><script>alert(1)</script>',
    contentWidth: '600" onload="x' as unknown as number,
  };
  const blocks = [
    { id: 't', type: 'text', html: '<p>x</p>', align: 'left" onclick="x', color: 'red;background:url(x)' },
    { id: 'h', type: 'heading', level: 1, html: 'h', align: '"><script>', color: 'expression(alert(1))' },
    { id: 'b', type: 'button', label: 'x', href: 'https://x.test', align: 'x" y="', background: evil, color: 'blue;}</style>' },
    { id: 'd', type: 'divider', color: evil },
    { id: 'so', type: 'social', align: '"><i>', items: [{ network: 'facebook', url: 'https://f.test' }, { network: 'constructor', url: 'https://c.test' }] },
    { id: 'sp', type: 'spacer', height: '40" onclick="x' },
  ] as unknown as EmailBlock[];
  const hostileRow = row('1', [blocks], { background: evil, contentBackground: 'red}</style><script>', paddingTop: '1" onclick="x' as unknown as number });
  hostileRow.columns[0].verticalAlign = '" onload="x' as never;
  const badge = SOCIAL_BADGES.facebook;
  const original = badge.color;
  badge.color = evil;
  let html: string;
  try {
    html = renderEmail(input(doc(hostileRow), { theme })).html;
  } finally {
    badge.color = original;
  }
  for (const needle of ['onmouseover', 'onclick', 'onload', '<script', 'url(', 'expression(', 'rgb(1,2,3);x', '</style><']) {
    assert.ok(!html.includes(needle), `${needle} leaked`);
  }
  assert.equal((html.match(/<style>/g) ?? []).length, 1);
  assert.equal((html.match(/<\/style>/g) ?? []).length, 1);
  assert.ok(html.includes('a{color:#2563eb}'), 'an invalid link colour falls back to the default');
  assert.ok(html.includes('bgcolor="#2563eb"'), 'an invalid button colour falls back to the theme / default');
  assert.ok(html.includes('max-width:600px'), 'an invalid width falls back to the default');
  assert.ok(html.includes('font-family:Arial, Helvetica, sans-serif'));
  assert.ok(!html.includes('#1877f2'), 'the invalid badge colour is replaced by the neutral one');
  assert.ok(html.includes('bgcolor="#64748b"'));
});

test('safeColor accepts hex, rgb(a) and plain names only', () => {
  for (const ok of ['#fff', '#FFFFFF', '#ffffff80', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'red', 'Transparent', '  #abc  ']) {
    assert.equal(safeColor(ok, 'X'), ok.trim(), ok);
  }
  for (const bad of ['', '#ff', '#fffff', '#ggg', 'rgb(1,2)', 'rgb(a,b,c)', 'rgb(1,2,3);x', 'red"', 'red;', 'red}', 'var(--x)', 'url(x)', 'expression(1)', 'a b', '#fff"', null, undefined, 5]) {
    assert.equal(safeColor(bad, 'X'), 'X', String(bad));
  }
  assert.equal(alignOf('justify' as never), 'left');
  assert.equal(alignOf('"' as never, 'center'), 'center');
  assert.equal(alignOf('right'), 'right');
  assert.equal(safeTheme({ ...THEME_DEFAULTS, contentWidth: 9999 }).contentWidth, 800);
  assert.equal(safeTheme({ ...THEME_DEFAULTS, contentWidth: 100 }).contentWidth, 520);
});

// ---- merge tags in the output -----------------------------------------------------------

test('the renderer outputs every merge tag in the canonical form', () => {
  const r = renderEmail(input(doc(row('1', [[
    text('a', '<p>Hi {{&nbsp;first_name }}, {{ first_name | there&nbsp;}}, {{ email }} and {{&nbsp;&nbsp;company | &nbsp;none }}</p>'),
    { id: 'b', type: 'button', label: '{{ first_name }}', href: '{{ view_online_url | https://x.test/?a=1&b=2 }}' },
  ]])), { subject: 'Hi {{ first_name | you }}', preheader: '{{&nbsp;first_name }} news' }));
  assert.ok(r.html.includes('<p style="margin:0">Hi {{first_name}}, {{first_name|there}}, {{email}} and {{company|none}}</p>'), r.html);
  assert.ok(!r.html.includes('&nbsp;first_name') && !r.html.includes(' '));
  assert.ok(r.html.includes('href="{{view_online_url|https://x.test/?a=1&amp;b=2}}"'));
  assert.ok(r.html.includes('>{{first_name}}</a>'));
  assert.ok(r.html.includes('<title>Hi {{first_name|you}}</title>'));
  assert.match(r.html, /\{\{first_name\}\} news(?:&zwnj;&nbsp;)+<\/div>/);
  assert.ok(r.text.includes('Hi {{first_name}}, {{first_name|there}}, {{email}} and {{company|none}}'), r.text);
});

test('{{&nbsp;first_name }} in a text block is output as {{first_name}}', () => {
  const r = renderEmail(input(doc(row('1', [[text('a', '<p>{{&nbsp;first_name }}</p>')]]))));
  assert.ok(r.html.includes('<p style="margin:0">{{first_name}}</p>'));
  assert.ok(r.text.startsWith('{{first_name}}\n'));
});

test('an unknown tag written with NBSP is still reported', () => {
  const r = renderEmail(input(doc(row('1', [[text('a', '<p>{{&nbsp;coupon }}</p>')]]))));
  assert.ok(r.warnings.some((w) => w.code === 'unknown_merge_tag' && w.blockId === 'a' && w.message.en.includes('{{coupon}}')));
});

test('fallbacks are not escaped twice: renderer output substituted for sending', () => {
  const r = renderEmail(input(doc(row('1', [[
    { id: 'b', type: 'button', label: 'Go', href: '{{view_online_url|https://x.test/p?a=1&b=2}}' },
    text('t', '<p>Hello {{first_name|Tom &amp; Jerry}}</p>'),
    { id: 'i', type: 'image', src: 'https://x.test/a.png', alt: 'For {{first_name|Tom & Jerry}}' },
  ]])), { subject: 'Hi {{first_name|Tom & Jerry}}', preheader: 'About {{company|A & B}}' }));
  const sent = substituteMergeTags(r.html, {}, { context: 'html', mode: 'send' });
  assert.ok(sent.includes('<a href="https://x.test/p?a=1&amp;b=2" target="_blank"'), 'attribute fallback');
  assert.ok(sent.includes('Hello Tom &amp; Jerry</p>'), 'sanitised text fallback');
  assert.ok(sent.includes('alt="For Tom &amp; Jerry"'), 'alt attribute fallback');
  assert.ok(sent.includes('<title>Hi Tom &amp; Jerry</title>'), 'title');
  assert.ok(sent.includes('About A &amp; B'), 'preheader');
  assert.ok(!sent.includes('&amp;amp;'), 'no double escaping anywhere');
});

test('absoluteUrl', () => {
  assert.equal(absoluteUrl('/a.png', 'https://h.test/'), 'https://h.test/a.png');
  assert.equal(absoluteUrl('a.png', 'https://h.test'), 'https://h.test/a.png');
  assert.equal(absoluteUrl('//cdn.test/a.png', 'https://h.test'), '//cdn.test/a.png');
  assert.equal(absoluteUrl('https://x.test/a.png', 'https://h.test'), 'https://x.test/a.png');
  assert.equal(absoluteUrl('data:image/png;base64,AA', 'https://h.test'), 'data:image/png;base64,AA');
  assert.equal(absoluteUrl('/a.png', ''), '/a.png');
});

test('output is deterministic', () => {
  const d = doc(row('1-1-1', [[text('a', '<p>1</p>')], [{ id: 'b', type: 'button', label: 'x', href: 'https://x.test' }], []]));
  assert.equal(renderEmail(input(d)).html, renderEmail(input(d)).html);
});

// ---- plain text -------------------------------------------------------------------------

test('text version is built from the blocks', () => {
  const body = doc(
    row('1-1', [
      [
        { id: 'h', type: 'heading', level: 1, html: 'Big <strong>news</strong> &amp; more' },
        text('t', '<p>Read <a href="https://x.test/a?b=1&amp;c=2">our post</a>.</p><ul><li>One</li><li>Two</li></ul><p>Line<br>break</p>'),
      ],
      [
        { id: 'i', type: 'image', src: 'https://x.test/a.png', alt: 'A photo' },
        { id: 'b', type: 'button', label: 'Buy now', href: 'https://x.test/buy' },
        { id: 'd', type: 'divider' },
        { id: 's', type: 'spacer', height: 10 },
        { id: 'so', type: 'social', items: [{ network: 'facebook', url: 'https://f.test' }] },
        { id: 'raw', type: 'html', html: '<style>p{color:red}</style><p>Raw &nbsp;text</p>' },
      ],
    ]),
  );
  const { text: out } = renderEmail({ ...input(body), footer: null });
  assert.equal(
    out,
    [
      'Big news & more',
      'Read our post (https://x.test/a?b=1&c=2).\n\n- One\n- Two\n\nLine\nbreak',
      'A photo',
      'Buy now: https://x.test/buy',
      '----',
      'Facebook: https://f.test',
      'Raw  text',
    ].join('\n\n') + '\n',
  );
});

test('htmlToPlainText: a link whose label is its URL is not repeated; numeric entities decode', () => {
  assert.equal(htmlToPlainText('<a href="https://x.test">https://x.test</a>'), 'https://x.test');
  assert.equal(htmlToPlainText('A&#39;s &#x26; B&zwnj;'), "A's & B");
  assert.equal(renderText([null, undefined]), '');
});

test('cssText skips empty values', () => {
  assert.equal(cssText({ a: '1', b: '', c: '3' }), 'a:1;c:3');
});
