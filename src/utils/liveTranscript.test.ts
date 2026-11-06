import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTranscriptEvent,
  catchUpText,
  createTranscriptState,
  formatClock,
  liveTranscriptToText,
  recentSegmentIds,
  recentSegments,
  visibleSegments,
  type LiveTranscriptState,
  type RealtimeTranscriptEvent,
} from "./liveTranscript.ts";
import {
  failuresAfterDrop,
  isSessionExpiredError,
  nextReconnectDelay,
  rotateAfterMs,
} from "./liveReconnect.ts";
import { DEFAULT_VAD, initialVad, rmsFromBytes, stepVad } from "./liveCommitVad.ts";

const DELTA = "conversation.item.input_audio_transcription.delta";
const DONE = "conversation.item.input_audio_transcription.completed";
const FAILED = "conversation.item.input_audio_transcription.failed";

const run = (events: Array<[RealtimeTranscriptEvent, number]>): LiveTranscriptState =>
  events.reduce((s, [e, t]) => applyTranscriptEvent(s, e, t), createTranscriptState());

test("deltas for one item are appended and stay in progress", () => {
  const s = run([
    [{ type: DELTA, item_id: "a", delta: "Hello" }, 1],
    [{ type: DELTA, item_id: "a", delta: " there" }, 2],
  ]);
  assert.equal(s.segments.length, 1);
  assert.equal(s.segments[0].text, "Hello there");
  assert.equal(s.segments[0].final, false);
  assert.equal(s.segments[0].startSec, 1);
  assert.equal(s.segments[0].updatedSec, 2);
});

test("completed replaces the streamed text and finalises it", () => {
  const s = run([
    [{ type: DELTA, item_id: "a", delta: "hello ther" }, 1],
    [{ type: DONE, item_id: "a", transcript: " Hello there. " }, 3],
  ]);
  assert.equal(s.segments[0].text, "Hello there.");
  assert.equal(s.segments[0].final, true);
  assert.equal(s.segments[0].startSec, 1);
});

test("a late delta cannot reopen a finished segment", () => {
  const s = run([
    [{ type: DONE, item_id: "a", transcript: "Done." }, 3],
    [{ type: DELTA, item_id: "a", delta: " stray" }, 4],
  ]);
  assert.equal(s.segments[0].text, "Done.");
});

test("items complete out of order but keep the order they were committed in", () => {
  const s = run([
    [{ type: "input_audio_buffer.committed", item_id: "a", previous_item_id: null }, 1],
    [{ type: "input_audio_buffer.committed", item_id: "b", previous_item_id: "a" }, 5],
    [{ type: DONE, item_id: "b", transcript: "second" }, 7],
    [{ type: DONE, item_id: "a", transcript: "first" }, 8],
  ]);
  assert.deepEqual(visibleSegments(s.segments).map((x) => x.text), ["first", "second"]);
});

test("previous_item_id places a late-arriving item where it was spoken", () => {
  const s = run([
    [{ type: DELTA, item_id: "a", delta: "one" }, 1],
    [{ type: DELTA, item_id: "c", delta: "three" }, 9],
    [{ type: DELTA, item_id: "b", delta: "two", previous_item_id: "a" }, 10],
  ]);
  assert.deepEqual(s.segments.map((x) => x.id), ["a", "b", "c"]);
});

test("an empty completed event for an unknown item adds nothing and returns the same state", () => {
  const before = createTranscriptState();
  const after = applyTranscriptEvent(before, { type: DONE, item_id: "x", transcript: "  " }, 1);
  assert.equal(after, before);
});

test("an empty completed event removes a row that never had text", () => {
  const s = run([
    [{ type: "input_audio_buffer.committed", item_id: "a" }, 1],
    [{ type: DONE, item_id: "a", transcript: "" }, 2],
  ]);
  assert.equal(s.segments.length, 0);
});

test("unknown events and events without an item id leave the state untouched", () => {
  const s = run([[{ type: DELTA, item_id: "a", delta: "x" }, 1]]);
  assert.equal(applyTranscriptEvent(s, { type: "session.updated" }, 2), s);
  assert.equal(applyTranscriptEvent(s, { type: DELTA, delta: "y" }, 2), s);
  assert.equal(applyTranscriptEvent(s, { type: DELTA, item_id: "a", delta: "" }, 2), s);
});

test("a failed item is hidden but the rest keep flowing", () => {
  const s = run([
    [{ type: DELTA, item_id: "a", delta: "ok" }, 1],
    [{ type: DELTA, item_id: "b", delta: "bad" }, 2],
    [{ type: FAILED, item_id: "b" }, 3],
  ]);
  assert.deepEqual(visibleSegments(s.segments).map((x) => x.id), ["a"]);
});

test("recentSegments keeps the last N seconds and anything still in progress", () => {
  const s = run([
    [{ type: DONE, item_id: "old", transcript: "old" }, 10],
    [{ type: DONE, item_id: "mid", transcript: "mid" }, 100],
    [{ type: DELTA, item_id: "live", delta: "live" }, 20], // started early, still streaming
  ]);
  // "old" started at 10 (done at 10), "mid" at 100, "live" started at 20
  const ids = recentSegments(s.segments, 120, 30).map((x) => x.id);
  assert.deepEqual(ids, ["mid", "live"]);
  assert.deepEqual([...recentSegmentIds(s.segments, 120, 30)].sort(), ["live", "mid"]);
});

test("catchUpText joins the last two minutes oldest first", () => {
  const s = run([
    [{ type: DONE, item_id: "a", transcript: "ancient" }, 0],
    [{ type: DONE, item_id: "b", transcript: "recent one" }, 200],
    [{ type: DONE, item_id: "c", transcript: "recent two" }, 250],
  ]);
  assert.equal(catchUpText(s.segments, 260, 120), "recent one\nrecent two");
  assert.equal(catchUpText([], 10), "");
});

test("formatClock pads minutes and switches to hours past an hour", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(65), "01:05");
  assert.equal(formatClock(3661), "1:01:01");
  assert.equal(formatClock(-4), "00:00");
  assert.equal(formatClock(Number.NaN), "00:00");
});

test("liveTranscriptToText gives plain lines, optionally with timestamps", () => {
  const s = run([
    [{ type: DONE, item_id: "a", transcript: "Hi." }, 5],
    [{ type: DONE, item_id: "b", transcript: "Bye." }, 70],
  ]);
  assert.equal(liveTranscriptToText(s.segments), "Hi.\nBye.");
  assert.equal(liveTranscriptToText(s.segments, true), "[00:05] Hi.\n[01:10] Bye.");
});

// --- commit detection -------------------------------------------------------------------

const feed = (levels: number[], dtMs = 50) => {
  let st = initialVad();
  const commits: number[] = [];
  levels.forEach((lv, i) => {
    const r = stepVad(st, lv, dtMs, DEFAULT_VAD);
    st = r.state;
    if (r.commit) commits.push(i);
  });
  return { st, commits };
};

const speech = (ms: number, dt = 50) => new Array(Math.round(ms / dt)).fill(0.08);
const quiet = (ms: number, dt = 50) => new Array(Math.round(ms / dt)).fill(0.001);

test("silence alone never commits", () => {
  assert.deepEqual(feed(quiet(10000)).commits, []);
});

test("speech followed by 700 ms of silence commits once", () => {
  const { commits } = feed([...speech(1500), ...quiet(2000)]);
  assert.equal(commits.length, 1);
  // 30 speech ticks, then silence reaches 700 ms on the 14th quiet tick.
  assert.equal(commits[0], 30 + 14 - 1);
});

test("a blip shorter than the minimum is dropped without a commit", () => {
  assert.deepEqual(feed([...speech(150), ...quiet(2000)]).commits, []);
});

test("a short pause inside a sentence does not split it", () => {
  const { commits } = feed([...speech(1000), ...quiet(400), ...speech(1000), ...quiet(1000)]);
  assert.equal(commits.length, 1);
});

test("unbroken speech is committed every 20 s", () => {
  const { commits } = feed(speech(45000));
  assert.deepEqual(commits.length, 2);
});

test("two separate turns commit twice", () => {
  const { commits } = feed([...speech(1000), ...quiet(1000), ...speech(1000), ...quiet(1000)]);
  assert.equal(commits.length, 2);
});

test("rmsFromBytes is zero for a flat signal and grows with amplitude", () => {
  assert.equal(rmsFromBytes(new Uint8Array(64).fill(128)), 0);
  assert.equal(rmsFromBytes([]), 0);
  const loud = rmsFromBytes(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 228 : 28)));
  assert.ok(loud > 0.7 && loud < 0.8, String(loud));
});

// --- reconnect decisions ----------------------------------------------------------------

test("reconnect backs off 1 s, 3 s, 10 s, then gives up", () => {
  assert.equal(nextReconnectDelay(0), 1000);
  assert.equal(nextReconnectDelay(1), 3000);
  assert.equal(nextReconnectDelay(2), 10000);
  assert.equal(nextReconnectDelay(3), null);
  assert.equal(nextReconnectDelay(-1), null);
});

test("a session is replaced five minutes before the 60 minute limit", () => {
  assert.equal(rotateAfterMs(), 55 * 60 * 1000);
  assert.equal(rotateAfterMs(1000, 5000), 0);
});

test("a healthy stretch resets the failure streak; an instant drop does not", () => {
  assert.equal(failuresAfterDrop(2, 120_000), 0);
  assert.equal(failuresAfterDrop(2, 2_000), 2);
});

test("only expiry-like error events are treated as an expired session", () => {
  assert.equal(isSessionExpiredError({ code: "session_expired" }), true);
  assert.equal(isSessionExpiredError({ message: "Your session hit the maximum duration of 60 minutes." }), true);
  assert.equal(isSessionExpiredError({ message: "Session expired" }), true);
  assert.equal(isSessionExpiredError({ code: "invalid_event", message: "bad event" }), false);
  assert.equal(isSessionExpiredError(null), false);
});
