import test from 'node:test';
import assert from 'node:assert/strict';
import { dragPayload, hasFiles, indexFromMids, rowGapFromPointer, sameTarget, MIME_BLOCK, MIME_MOVE, MIME_ROW } from './dnd.ts';

test('indexFromMids: before the first item whose midpoint is below the pointer', () => {
  const mids = [20, 60, 100];
  assert.equal(indexFromMids(mids, 0), 0);
  assert.equal(indexFromMids(mids, 19), 0);
  assert.equal(indexFromMids(mids, 20), 1);
  assert.equal(indexFromMids(mids, 59), 1);
  assert.equal(indexFromMids(mids, 99), 2);
  assert.equal(indexFromMids(mids, 500), 3);
  assert.equal(indexFromMids([], 10), 0);
});

test('rowGapFromPointer: top half before, bottom half after', () => {
  assert.equal(rowGapFromPointer(2, 100, 80, 110), 2);
  assert.equal(rowGapFromPointer(2, 100, 80, 139), 2);
  assert.equal(rowGapFromPointer(2, 100, 80, 140), 3);
  assert.equal(rowGapFromPointer(2, 100, 80, 179), 3);
});

test('sameTarget', () => {
  assert.equal(sameTarget(null, null), true);
  assert.equal(sameTarget({ kind: 'row', index: 1 }, { kind: 'row', index: 1 }), true);
  assert.equal(sameTarget({ kind: 'row', index: 1 }, { kind: 'row', index: 2 }), false);
  assert.equal(sameTarget({ kind: 'block', columnId: 'c', index: 0 }, { kind: 'block', columnId: 'c', index: 0 }), true);
  assert.equal(sameTarget({ kind: 'block', columnId: 'c', index: 0 }, { kind: 'block', columnId: 'd', index: 0 }), false);
  assert.equal(sameTarget({ kind: 'row', index: 0 }, { kind: 'block', columnId: 'c', index: 0 }), false);
  assert.equal(sameTarget(null, { kind: 'row', index: 0 }), false);
});

test('hasFiles and dragPayload', () => {
  assert.equal(hasFiles({ types: ['text/plain', 'Files'] }), true);
  assert.equal(hasFiles({ types: [MIME_BLOCK] }), false);
  assert.equal(hasFiles(null), false);
  assert.deepEqual(dragPayload({ kind: 'block-new', type: 'text' }), { mime: MIME_BLOCK, value: 'text' });
  assert.deepEqual(dragPayload({ kind: 'row-new', layout: '1-2' }), { mime: MIME_ROW, value: '1-2' });
  assert.deepEqual(dragPayload({ kind: 'block-move', id: 'x' }), { mime: MIME_MOVE, value: 'block:x' });
  assert.deepEqual(dragPayload({ kind: 'row-move', id: 'y' }), { mime: MIME_MOVE, value: 'row:y' });
});
