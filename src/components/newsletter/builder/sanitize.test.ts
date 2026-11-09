import test from 'node:test';
import assert from 'node:assert/strict';
import { filterColorOnlyStyle, sanitizeRichHtml } from '../../../utils/safeHtml.ts';

test('newsletter profile: fails safe without a DOM (escapes, never passes markup through)', () => {
  const out = sanitizeRichHtml('<p onclick="x">hi</p><script>alert(1)</script>', 'newsletter');
  assert.ok(!out.includes('<'), out);
  assert.equal(sanitizeRichHtml('', 'newsletter'), '');
});

test('filterColorOnlyStyle keeps only color', () => {
  assert.equal(filterColorOnlyStyle('color: #ff0000; font-weight: bold; background-color: red'), 'color: #ff0000');
  assert.equal(filterColorOnlyStyle('color: rgb(255, 0, 0);'), 'color: rgb(255, 0, 0)');
  assert.equal(filterColorOnlyStyle('background-color: red; text-align: center'), '');
  assert.equal(filterColorOnlyStyle('color: url(javascript:alert(1))'), '');
  assert.equal(filterColorOnlyStyle(''), '');
});
