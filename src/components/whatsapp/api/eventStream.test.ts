import assert from "node:assert/strict";
import test from "node:test";
import { readEventStream, SseParser, type SseEvent } from "./eventStream.ts";

const parse = (...chunks: string[]): SseEvent[] => {
  const parser = new SseParser();
  return chunks.flatMap((c) => parser.push(c));
};

test("an event is its event name, its data and its id, dispatched at the blank line", () => {
  assert.deepEqual(parse('event: qr\ndata: {"qr":"abc"}\nid: 7\n\n'), [{ event: "qr", data: '{"qr":"abc"}', id: "7" }]);
});

test("the event name defaults to message and data lines are joined", () => {
  assert.deepEqual(parse("data: one\ndata: two\n\n"), [{ event: "message", data: "one\ntwo", id: null }]);
});

test("comments, unknown fields and a blank line without data produce nothing", () => {
  assert.deepEqual(parse(": keep-alive\n\nretry: 3000\nfoo: bar\n\n"), []);
});

test("only one space after the colon is dropped, and a field without a colon has an empty value", () => {
  assert.deepEqual(parse("data:  two spaces\n\n"), [{ event: "message", data: " two spaces", id: null }]);
  assert.deepEqual(parse("data\n\n"), [{ event: "message", data: "", id: null }]);
});

test("LF, CRLF and CR line breaks all work", () => {
  const expected = [{ event: "status", data: "connected", id: null }];
  assert.deepEqual(parse("event: status\ndata: connected\n\n"), expected);
  assert.deepEqual(parse("event: status\r\ndata: connected\r\n\r\n"), expected);
  assert.deepEqual(parse("event: status\rdata: connected\r\r"), []); // the last CR may start a CRLF: wait
  assert.deepEqual(parse("event: status\rdata: connected\r\rdata: next\n\n").length, 2);
});

test("a chunk may end anywhere", () => {
  const text = 'event: qr\r\ndata: {"qr":"a b"}\r\nid: 1\r\n\r\nevent: status\r\ndata: connected\r\n\r\n';
  const whole = parse(text);
  assert.equal(whole.length, 2);
  // Split at every possible position, including between the CR and the LF of one line break.
  for (let at = 1; at < text.length; at++) {
    assert.deepEqual(parse(text.slice(0, at), text.slice(at)), whole, `split at ${at}`);
  }
  // And one character at a time.
  assert.deepEqual(parse(...text.split("")), whole);
});

test("the event name and the id do not leak into the next event", () => {
  const events = parse("event: qr\nid: 1\ndata: a\n\ndata: b\n\n");
  assert.equal(events[0]?.event, "qr");
  assert.equal(events[1]?.event, "message");
  assert.equal(events[1]?.id, "1"); // the last event id sticks, as the format says
});

test("a byte order mark at the start is ignored", () => {
  assert.deepEqual(parse("﻿data: x\n\n"), [{ event: "message", data: "x", id: null }]);
});

test("an event cut off by the end of the stream is not dispatched", () => {
  assert.deepEqual(parse("data: complete\n\ndata: cut off"), [{ event: "message", data: "complete", id: null }]);
});

const streamOf = (...parts: (string | Uint8Array)[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(typeof p === "string" ? encoder.encode(p) : p);
      controller.close();
    },
  });
};

test("readEventStream reads a body to its end", async () => {
  const seen: SseEvent[] = [];
  await readEventStream(streamOf("event: qr\ndata: 1\n\n", "event: status\nda", "ta: 2\n\n"), (e) => seen.push(e));
  assert.deepEqual(seen.map((e) => [e.event, e.data]), [["qr", "1"], ["status", "2"]]);
});

test("readEventStream decodes a multi-byte character split between two chunks", async () => {
  const bytes = new TextEncoder().encode("data: Faktúra č. 12\n\n");
  const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "ú"
  const seen: SseEvent[] = [];
  await readEventStream(streamOf(bytes.slice(0, cut), bytes.slice(cut)), (e) => seen.push(e));
  assert.equal(seen[0]?.data, "Faktúra č. 12");
});

test("readEventStream stops when the signal aborts", async () => {
  const controller = new AbortController();
  let pushNext: (() => void) | undefined;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(encoder.encode("data: first\n\n"));
      pushNext = () => c.enqueue(encoder.encode("data: second\n\n"));
    },
    cancel() {
      pushNext = undefined;
    },
  });
  const seen: string[] = [];
  const done = readEventStream(body, (e) => {
    seen.push(e.data);
    controller.abort();
  }, controller.signal);
  await done;
  assert.deepEqual(seen, ["first"]);
  assert.equal(pushNext, undefined, "the stream was cancelled");
});
