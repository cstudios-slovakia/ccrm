import assert from "node:assert/strict";
import test from "node:test";
import { bubbleSegments, firstUrl, initialsFor, prettifyMentions, splitLinks } from "./messageText.ts";

test("splitLinks finds http(s) URLs and leaves the text around them", () => {
  assert.deepEqual(splitLinks("see https://example.com/a?b=1 now"), [
    { type: "text", value: "see " },
    { type: "url", value: "https://example.com/a?b=1" },
    { type: "text", value: " now" },
  ]);
});

test("trailing punctuation belongs to the sentence, not the URL", () => {
  assert.deepEqual(splitLinks("(https://example.com/x)."), [
    { type: "text", value: "(" },
    { type: "url", value: "https://example.com/x" },
    { type: "text", value: ")." },
  ]);
  assert.equal(firstUrl("go to https://example.com, then stop"), "https://example.com");
});

test("only http and https become links", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://host/file", "www.example.com", "mailto:a@b.sk"]) {
    assert.deepEqual(splitLinks(bad), [{ type: "text", value: bad }], bad);
  }
  assert.equal(firstUrl("no link here"), null);
});

test("plain text and the empty string pass through", () => {
  assert.deepEqual(splitLinks("hello"), [{ type: "text", value: "hello" }]);
  assert.deepEqual(splitLinks(""), []);
});

test("raw mention ids become phone numbers; resolved ones stay", () => {
  assert.equal(prettifyMentions("hi @421900123456!"), "hi @+421900123456!");
  assert.equal(prettifyMentions("hi @+421900123456"), "hi @+421900123456");
  assert.equal(prettifyMentions("hi @Peter"), "hi @Peter");
  assert.equal(prettifyMentions("a@4219001234567 b"), "a@4219001234567 b");
  assert.deepEqual(bubbleSegments("@421900123456 https://x.sk"), [
    { type: "text", value: "@+421900123456 " },
    { type: "url", value: "https://x.sk" },
  ]);
});

test("initials", () => {
  assert.equal(initialsFor("Peter Puhovich"), "PP");
  assert.equal(initialsFor("  anna  "), "A");
  assert.equal(initialsFor("one two three"), "OT");
  assert.equal(initialsFor("   "), "?");
});
