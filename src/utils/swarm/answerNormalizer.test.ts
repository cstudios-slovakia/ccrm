import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer } from './answerNormalizer.ts';

test('normalizeAnswer matches known candidate entities from graph', () => {
  const known = ['Hájos Zoltán', 'Miške Tamás', 'Horváth Zoltán'];

  assert.equal(
    normalizeAnswer('Miške Tamás a jövőnk kulcsa!', known),
    'Miške Tamás'
  );
  assert.equal(
    normalizeAnswer('Miske Tamás a megfelelő vezető!', known),
    'Miške Tamás'
  );
  assert.equal(
    normalizeAnswer('Hájos Zoltán marad a polgármester', known),
    'Hájos Zoltán'
  );
});

test('normalizeAnswer truncates long sentences when no candidate matches', () => {
  const result = normalizeAnswer('A szolidaritás a közösség ereje és alapvető értéke.', []);
  assert.ok(result.length <= 25);
  assert.equal(result.includes('.'), false);
});

test('normalizeAnswer preserves short clean answers', () => {
  assert.equal(normalizeAnswer('Forest Green', []), 'Forest Green');
  assert.equal(normalizeAnswer('Matte Black', []), 'Matte Black');
  assert.equal(normalizeAnswer('Bizonytalan', []), 'Bizonytalan');
});
