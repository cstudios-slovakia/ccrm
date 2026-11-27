import assert from "node:assert/strict";
import test from "node:test";
import {
  applySonioxResponse,
  createSonioxState,
  finishSonioxStream,
  nextStream,
  sonioxSegments,
  type SonioxResponse,
  type SonioxState,
  type SonioxToken,
} from "./sonioxTokens.ts";

const tok = (text: string, startMs: number, endMs: number, speaker?: string, is_final = true): SonioxToken => ({
  text,
  start_ms: startMs,
  end_ms: endMs,
  is_final,
  ...(speaker != null ? { speaker } : {}),
});

const feed = (steps: Array<SonioxResponse | [SonioxResponse, number]>, state = createSonioxState()): SonioxState =>
  steps.reduce<SonioxState>((s, step) => {
    const [res, offset] = Array.isArray(step) ? step : [step, 0];
    return applySonioxResponse(s, res, offset);
  }, state);

test("final tokens accumulate and are never repeated; the text is trimmed", () => {
  const s = feed([
    { tokens: [tok("Hel", 0, 200, "1"), tok("lo", 200, 400, "1")] },
    { tokens: [tok(" there", 450, 800, "1")] },
  ]);
  const segs = sonioxSegments(s);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].text, "Hello there");
  assert.equal(segs[0].speaker, "P1");
});

test("non-final tokens are replaced by every response, not appended", () => {
  const s2 = feed([
    { tokens: [tok("Hello", 0, 400, "1"), tok(" wor", 450, 600, "1", false)] },
    { tokens: [tok(" world", 450, 900, "1", false)] },
  ]);
  const segs = sonioxSegments(s2);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].text, "Hello world");
  assert.equal(segs[0].final, false);
});

test("an empty non-final set clears the in-progress tail", () => {
  const s = feed([
    { tokens: [tok(" maybe", 0, 300, "1", false)] },
    { tokens: [] },
  ]);
  assert.deepEqual(sonioxSegments(s), []);
});

test("control tokens <fin> and <end> are dropped and seal the turn", () => {
  const s = feed([
    { tokens: [tok("Done.", 0, 500, "1"), { text: "<fin>", is_final: true }] },
    { tokens: [tok(" More", 600, 900, "1")] },
  ]);
  const segs = sonioxSegments(s);
  assert.deepEqual(segs.map((x) => x.text), ["Done.", "More"]); // sealed: the next tokens open a new turn
  assert.equal(segs[0].final, true);
  assert.ok(!segs.some((x) => x.text.includes("<")));
  const e = feed([{ tokens: [tok("Hi", 0, 100, "1"), { text: "<end>", is_final: true }] }]);
  assert.equal(sonioxSegments(e)[0].text, "Hi");
  assert.equal(sonioxSegments(e)[0].final, true);
});

test("a speaker change starts a new turn", () => {
  const s = feed([
    { tokens: [tok("One.", 0, 400, "1"), tok(" Two.", 450, 800, "2"), tok(" Three.", 850, 1200, "2"), tok(" Four.", 1250, 1500, "1")] },
  ]);
  const segs = sonioxSegments(s);
  assert.deepEqual(segs.map((x) => [x.speaker, x.text]), [
    ["P1", "One."],
    ["P2", "Two. Three."],
    ["P1", "Four."],
  ]);
  assert.deepEqual(segs.map((x) => x.id), ["s1-t1", "s1-t2", "s1-t3"]);
});

test("a gap of more than 1.5 s between tokens starts a new turn, 1.5 s exactly does not", () => {
  const split = feed([{ tokens: [tok("A", 0, 500, "1"), tok(" B", 2100, 2400, "1")] }]);
  assert.equal(sonioxSegments(split).length, 2);
  const joined = feed([{ tokens: [tok("A", 0, 500, "1"), tok(" B", 2000, 2400, "1")] }]);
  assert.equal(sonioxSegments(joined).length, 1);
});

test("ids are stable when the in-progress turn becomes final", () => {
  const s1 = feed([{ tokens: [tok("First.", 0, 500, "1"), tok(" Second", 700, 1000, "2", false)] }]);
  const before = sonioxSegments(s1);
  assert.deepEqual(before.map((x) => [x.id, x.final]), [["s1-t1", false], ["s1-t2", false]]);
  // Second turn finalises, and a third speaker's turn starts.
  const s2 = applySonioxResponse(s1, { tokens: [tok(" Second", 700, 1000, "2"), tok(" Third", 1100, 1400, "3", false)] }, 0);
  const after = sonioxSegments(s2);
  assert.deepEqual(after.map((x) => x.id), ["s1-t1", "s1-t2", "s1-t3"]);
  assert.deepEqual(after.map((x) => x.final), [true, false, false]);
});

test("the in-progress tail that continues the last final turn keeps its id and stays non-final", () => {
  const s1 = feed([{ tokens: [tok("Hello", 0, 400, "1")] }]);
  const final1 = sonioxSegments(s1)[0];
  assert.equal(final1.id, "s1-t1");
  const s2 = applySonioxResponse(s1, { tokens: [tok(" there", 500, 800, "1", false)] }, 0);
  const merged = sonioxSegments(s2);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "s1-t1");
  assert.equal(merged[0].text, "Hello there");
  assert.equal(merged[0].final, false);
});

test("a turn is not reported final while it can still grow, and is once silence has passed", () => {
  let s = feed([{ tokens: [tok("Hello", 0, 400, "1")], final_audio_proc_ms: 500 }]);
  assert.equal(sonioxSegments(s)[0].final, false);
  s = applySonioxResponse(s, { tokens: [], final_audio_proc_ms: 2500 }, 0);
  assert.equal(sonioxSegments(s)[0].final, true);
});

test("finished seals the last turn and clears the tail", () => {
  const s = feed([
    { tokens: [tok("Bye.", 0, 400, "1"), tok(" x", 500, 600, "1", false)] },
    { tokens: [], finished: true },
  ]);
  const segs = sonioxSegments(s);
  assert.deepEqual(segs.map((x) => [x.text, x.final]), [["Bye.", true]]);
});

test("speakers are numbered by first appearance across streams, per stream", () => {
  let s = feed([{ tokens: [tok("a", 0, 100, "1"), tok(" b", 200, 300, "2")] }]);
  s = nextStream(s);
  // In the new stream Soniox's label "1" is a different mapping: it gets a new number.
  s = applySonioxResponse(s, { tokens: [tok("c", 0, 100, "1"), tok(" d", 200, 300, "2")] }, 60);
  const segs = sonioxSegments(s);
  assert.deepEqual(segs.map((x) => [x.id, x.speaker, x.text]), [
    ["s1-t1", "P1", "a"],
    ["s1-t2", "P2", "b"],
    ["s2-t1", "P3", "c"],
    ["s2-t2", "P4", "d"],
  ]);
  // Everything from the finished stream is final, and so is the turn followed by another.
  assert.deepEqual(segs.map((x) => x.final), [true, true, true, false]);
});

test("a speaker seen only in a non-final token does not burn a number", () => {
  let s = feed([{ tokens: [tok("a", 0, 100, "1"), tok(" flicker", 200, 300, "9", false)] }]);
  s = applySonioxResponse(s, { tokens: [tok(" b", 200, 300, "2")] }, 0);
  assert.deepEqual(sonioxSegments(s).map((x) => x.speaker), ["P1", "P2"]);
});

test("start times add the stream's elapsed offset", () => {
  const s = feed([[{ tokens: [tok("Hi", 2500, 3000, "1")] }, 120]]);
  const seg = sonioxSegments(s)[0];
  assert.equal(seg.startSec, 122.5);
  assert.equal(seg.updatedSec, 123);
});

test("tokens without a speaker (no diarization) make speakerless turns", () => {
  const s = feed([{ tokens: [tok("Plain", 0, 400), tok(" text", 450, 800), tok(" after pause", 3000, 3500)] }]);
  const segs = sonioxSegments(s);
  assert.equal(segs.length, 2);
  assert.ok(segs.every((x) => x.speaker === undefined));
  assert.equal(segs[0].text, "Plain text");
});

test("a lone space never opens a turn", () => {
  const s = feed([{ tokens: [tok(" ", 0, 10, "1")] }]);
  assert.deepEqual(sonioxSegments(s), []);
});

test("finishSonioxStream keeps the provisional words as final text", () => {
  const s = finishSonioxStream(feed([{ tokens: [tok("Almost", 0, 400, "1", false)] }]));
  const segs = sonioxSegments(s);
  assert.deepEqual(segs.map((x) => [x.text, x.final]), [["Almost", true]]);
});

test("a response without tokens or a malformed one leaves the turns alone", () => {
  const s0 = feed([{ tokens: [tok("Keep", 0, 400, "1")] }]);
  const s1 = applySonioxResponse(s0, {}, 0);
  assert.equal(sonioxSegments(s1)[0].text, "Keep");
  const s2 = applySonioxResponse(s0, { tokens: [null as unknown as SonioxToken, { text: 5 as unknown as string }] }, 0);
  assert.equal(sonioxSegments(s2)[0].text, "Keep");
});
