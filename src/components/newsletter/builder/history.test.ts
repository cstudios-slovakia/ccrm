import test from 'node:test';
import assert from 'node:assert/strict';
import { canRedo, canUndo, createHistory, endCoalesce, HISTORY_LIMIT, pushHistory, redo, undo } from './history.ts';

test('push, undo, redo', () => {
  let h = createHistory('a');
  h = pushHistory(h, 'b');
  h = pushHistory(h, 'c');
  assert.equal(h.present, 'c');
  assert.ok(canUndo(h) && !canRedo(h));
  h = undo(h);
  assert.equal(h.present, 'b');
  assert.ok(canRedo(h));
  h = redo(h);
  assert.equal(h.present, 'c');
  assert.equal(redo(h), h);
  assert.equal(undo(createHistory('a')).present, 'a');
});

test('a new push clears the redo stack; an identical value is a no-op', () => {
  let h = createHistory('a');
  h = pushHistory(h, 'b');
  h = undo(h);
  h = pushHistory(h, 'x');
  assert.deepEqual(h.future, []);
  assert.equal(pushHistory(h, 'x'), h);
});

test('typing in one session is one step', () => {
  let h = createHistory('');
  for (const v of ['h', 'he', 'hel', 'hell', 'hello']) h = pushHistory(h, v, { coalesceKey: 'text:1' });
  assert.equal(h.past.length, 1);
  h = undo(h);
  assert.equal(h.present, '');
  h = redo(h);
  assert.equal(h.present, 'hello');
});

test('another key, an unkeyed push, undo or endCoalesce starts a new step', () => {
  let h = createHistory('');
  h = pushHistory(h, 'a', { coalesceKey: 'k1' });
  h = pushHistory(h, 'ab', { coalesceKey: 'k2' });
  assert.equal(h.past.length, 2);
  h = pushHistory(h, 'abc');
  h = pushHistory(h, 'abcd', { coalesceKey: 'k2' });
  assert.equal(h.past.length, 4);
  h = endCoalesce(h);
  h = pushHistory(h, 'abcde', { coalesceKey: 'k2' });
  assert.equal(h.past.length, 5);
  h = undo(h);
  h = pushHistory(h, 'zz', { coalesceKey: 'k2' });
  assert.equal(h.past.length, 5);
});

test('the history keeps at most 100 steps by default', () => {
  let h = createHistory(0);
  for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = pushHistory(h, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.equal(h.past[0], 50);
  assert.equal(h.present, HISTORY_LIMIT + 50);
  const small = pushHistory(pushHistory(createHistory(0), 1, { limit: 1 }), 2, { limit: 1 });
  assert.deepEqual(small.past, [1]);
});
