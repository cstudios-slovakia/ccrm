import test from 'node:test';
import assert from 'node:assert/strict';
import { focusIsLost, shouldRefocusRoot } from './focus.ts';

const body = { tag: 'body' };
const html = { tag: 'html' };
const panelInput = { tag: 'input' };
const root = { tag: 'root' };

test('focus is lost when nothing, <body> or <html> is active', () => {
  assert.equal(focusIsLost(null, body, html), true);
  assert.equal(focusIsLost(undefined, body, html), true);
  assert.equal(focusIsLost(body, body, html), true);
  assert.equal(focusIsLost(html, body, html), true);
  assert.equal(focusIsLost(panelInput, body, html), false);
  assert.equal(focusIsLost(root, body, html), false);
});

test('the root takes the focus back when editing ended and the focus fell to <body> (Escape)', () => {
  assert.equal(shouldRefocusRoot(true, false, body, body, html), true);
});

test('the root does not steal the focus from a field the user clicked into', () => {
  assert.equal(shouldRefocusRoot(true, false, panelInput, body, html), false);
});

test('nothing happens while editing starts, continues or was never on', () => {
  assert.equal(shouldRefocusRoot(false, true, body, body, html), false);
  assert.equal(shouldRefocusRoot(true, true, body, body, html), false);
  assert.equal(shouldRefocusRoot(false, false, body, body, html), false);
});
