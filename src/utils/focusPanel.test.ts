import test from "node:test";
import assert from "node:assert/strict";
import { SPEAKER_COLORS, liveTailGroups, speakerColor, withSpeakerName } from "./focusPanel.ts";
import type { LiveSegment } from "./liveTranscript.ts";

const seg = (id: string, text: string, final: boolean, speaker?: string, startSec = 0): LiveSegment => ({
  id,
  text,
  final,
  startSec,
  updatedSec: startSec,
  speaker,
});

test("tail holds pending finals and every non-final, in order", () => {
  const segs = [seg("a", "done", true, "P1"), seg("b", "pending", true, "P2", 5), seg("c", "typing", false, "P2", 8)];
  const groups = liveTailGroups(segs, new Set(["b"]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].speaker, "P2");
  assert.equal(groups[0].text, "pending typing");
  assert.equal(groups[0].inProgress, true);
  assert.deepEqual(groups[0].ids, ["b", "c"]);
  assert.equal(groups[0].startSec, 5);
});

test("tail groups split on a speaker change and keep segments without a speaker together", () => {
  const segs = [seg("a", "one", false, "P1"), seg("b", "two", false, "P2"), seg("c", "three", false, "P1")];
  assert.deepEqual(liveTailGroups(segs, new Set()).map((g) => g.speaker), ["P1", "P2", "P1"]);
  const plain = [seg("a", "one", true), seg("b", "two", false)];
  const g = liveTailGroups(plain, new Set(["a"]));
  assert.equal(g.length, 1);
  assert.equal(g[0].text, "one two");
});

test("tail skips empty and failed rows, and is empty when everything is in the document", () => {
  const segs = [seg("a", "  ", false, "P1"), { ...seg("b", "x", true, "P1"), failed: true }, seg("c", "in doc", true, "P1")];
  assert.deepEqual(liveTailGroups(segs, new Set(["a", "b", "c"])), [
    { speaker: "P1", startSec: 0, text: "in doc", inProgress: false, ids: ["c"] },
  ]);
  assert.deepEqual(liveTailGroups(segs, new Set()), []);
  assert.deepEqual(liveTailGroups([seg("c", "in doc", true, "P1")], new Set()), []);
});

test("speaker colours: fixed palette, wraps after 8, unknown id falls back to the first", () => {
  assert.equal(SPEAKER_COLORS.length, 8);
  assert.equal(speakerColor("P1"), SPEAKER_COLORS[0]);
  assert.equal(speakerColor("P2"), SPEAKER_COLORS[1]);
  assert.equal(speakerColor("P8"), SPEAKER_COLORS[7]);
  assert.equal(speakerColor("P9"), SPEAKER_COLORS[0]);
  assert.equal(speakerColor(undefined), SPEAKER_COLORS[0]);
  assert.equal(speakerColor("x"), SPEAKER_COLORS[0]);
});

test("rename: trims, caps, and an empty draft resets to the default", () => {
  const a = withSpeakerName({}, "P2", "  Jana ");
  assert.deepEqual(a, { P2: "Jana" });
  assert.deepEqual(withSpeakerName(a, "P2", "   "), {});
  assert.equal(withSpeakerName({}, "P1", "x".repeat(100)).P1.length, 40);
  assert.deepEqual(a, { P2: "Jana" }); // input untouched
});
