import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TURNS,
  MAX_TURN_CHARS,
  applyFailure,
  applySuccess,
  beginRequest,
  buildRequest,
  countWords,
  createLiveDocState,
  decideUpdate,
  deriveStatus,
  isPristine,
  parseResponseSections,
  pendingIdsOf,
  pendingSegments,
  retryDelayMs,
  sectionHeading,
  shouldResetDocument,
  splitSpeakerTokens,
  type LiveDocState,
} from "./liveDocument.ts";
import type { LiveSegment } from "./liveTranscript.ts";

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

const seg = (id: string, text: string, extra: Partial<LiveSegment> = {}): LiveSegment => ({
  id,
  text,
  final: true,
  startSec: 0,
  updatedSec: 0,
  ...extra,
});

const S = 1000;

/** A state that already did one request at `at` ms. */
const afterRequestAt = (at: number, patch: Partial<LiveDocState> = {}): LiveDocState => ({
  ...createLiveDocState(),
  lastRequestAt: at,
  ...patch,
});

// ----- pending selection ------------------------------------------------------------------

test("pending: final, not failed, with text, not consumed; array order", () => {
  const segments = [
    seg("a", "one"),
    seg("b", "two", { final: false }),
    seg("c", "   "),
    seg("d", "four", { failed: true }),
    seg("e", "five"),
    seg("f", "six"),
  ];
  const consumed = new Set(["f"]);
  assert.deepEqual(
    pendingSegments(segments, consumed).map((s) => s.id),
    ["a", "e"],
  );
  const state = { ...createLiveDocState(), consumedIds: consumed };
  assert.deepEqual([...pendingIdsOf(segments, state)], ["a", "e"]);
});

test("countWords", () => {
  assert.equal(countWords("  "), 0);
  assert.equal(countWords("a  b\nc"), 3);
});

// ----- cadence ----------------------------------------------------------------------------

test("recording: the first pending speech asks at once, there is no earlier request", () => {
  const d = decideUpdate(createLiveDocState(), [seg("a", "hello there")], "recording", 5 * S);
  assert.deepEqual(d, { final: false });
});

test("recording: 40 words need 12 s since the last request", () => {
  const state = afterRequestAt(0);
  const segments = [seg("a", words(40))];
  assert.equal(decideUpdate(state, segments, "recording", 11 * S), null);
  assert.deepEqual(decideUpdate(state, segments, "recording", 12 * S), { final: false });
});

test("recording: fewer than 40 words wait for 30 s", () => {
  const state = afterRequestAt(0);
  const segments = [seg("a", words(39))];
  assert.equal(decideUpdate(state, segments, "recording", 29 * S), null);
  assert.deepEqual(decideUpdate(state, segments, "recording", 30 * S), { final: false });
});

test("recording: words add up across segments", () => {
  const state = afterRequestAt(0);
  const segments = [seg("a", words(20)), seg("b", words(20))];
  assert.deepEqual(decideUpdate(state, segments, "recording", 12 * S), { final: false });
});

test("recording: nothing pending, no request, however long it has been", () => {
  assert.equal(decideUpdate(afterRequestAt(0), [], "recording", 600 * S), null);
  assert.equal(decideUpdate(afterRequestAt(0), [seg("a", "x", { final: false })], "recording", 600 * S), null);
});

test("paused: any pending asks, but not within 8 s of the last request", () => {
  const state = afterRequestAt(0);
  const segments = [seg("a", "short")];
  assert.equal(decideUpdate(state, segments, "paused", 7 * S), null);
  assert.deepEqual(decideUpdate(state, segments, "paused", 8 * S), { final: false });
  assert.equal(decideUpdate(state, [], "paused", 60 * S), null);
});

test("idle and none never ask", () => {
  const segments = [seg("a", words(100))];
  assert.equal(decideUpdate(createLiveDocState(), segments, "idle", 100 * S), null);
  assert.equal(decideUpdate(createLiveDocState(), segments, "none", 100 * S), null);
});

test("never while a request is in flight", () => {
  const state = afterRequestAt(0, { inFlight: true });
  assert.equal(decideUpdate(state, [seg("a", words(100))], "recording", 100 * S), null);
});

// ----- stopped, final ---------------------------------------------------------------------

test("stopped: pending turns go out as the final call, even right after a request", () => {
  const state = afterRequestAt(0);
  assert.deepEqual(decideUpdate(state, [seg("a", "last words")], "stopped", 1 * S), { final: true });
});

test("stopped: an open section with nothing pending is closed once, then it stops", () => {
  const open = { id: "ld-1", markdown: "## A\n- x", closed: false };
  const state = afterRequestAt(0, { sections: [open] });
  assert.deepEqual(decideUpdate(state, [], "stopped", 1 * S), { final: true });
  assert.equal(decideUpdate({ ...state, finalDone: true }, [], "stopped", 99 * S), null);
});

test("stopped: with no open section and nothing pending there is nothing to close", () => {
  const closed = { id: "ld-1", markdown: "## A", closed: true };
  assert.equal(decideUpdate(afterRequestAt(0, { sections: [closed] }), [], "stopped", 99 * S), null);
  assert.equal(decideUpdate(createLiveDocState(), [], "stopped", 99 * S), null);
});

test("stopped: a late final segment after the final call gets one more final call", () => {
  const closed = { id: "ld-1", markdown: "## A", closed: true };
  const state = afterRequestAt(0, { sections: [closed], finalDone: true, consumedIds: new Set(["a"]) });
  const segments = [seg("a", "old"), seg("late", "flushed on stop")];
  assert.deepEqual(decideUpdate(state, segments, "stopped", 1 * S), { final: true });
});

test("stopped: a backlog bigger than one request drains first and closes last", () => {
  const segments = Array.from({ length: 2 * MAX_TURNS + 5 }, (_, i) => seg(`s${i}`, `turn ${i}`));
  let state = createLiveDocState();
  assert.deepEqual(decideUpdate(state, segments, "stopped", 100 * S), { final: false });
  const first = buildRequest(state, segments, "en", false)!;
  assert.equal(first.request.turns.length, MAX_TURNS);
  state = applySuccess(beginRequest(state, 100 * S), first, [{ markdown: "## A\n- x", closed: false }]);
  // A partial call keeps the 8 s minimum gap ...
  assert.equal(decideUpdate(state, segments, "stopped", 104 * S), null);
  assert.deepEqual(decideUpdate(state, segments, "stopped", 108 * S), { final: false });
  const second = buildRequest(state, segments, "en", false)!;
  state = applySuccess(beginRequest(state, 108 * S), second, [{ markdown: "## A\n- x\n- y", closed: false }]);
  // ... the rest fits in one request, so it is the final call, which is exempt from the gap.
  assert.deepEqual(decideUpdate(state, segments, "stopped", 109 * S), { final: true });
});

test("stopped: a final request that does not fit is sent as a plain one", () => {
  const segments = Array.from({ length: MAX_TURNS + 1 }, (_, i) => seg(`s${i}`, "x"));
  const built = buildRequest(createLiveDocState(), segments, "en", true)!;
  assert.equal(built.request.final, false);
  assert.equal(built.sentIds.length, MAX_TURNS);
});

// ----- backoff ----------------------------------------------------------------------------

test("never before nextRetryAt", () => {
  const state = afterRequestAt(0, { nextRetryAt: 50 * S });
  const segments = [seg("a", words(100))];
  assert.equal(decideUpdate(state, segments, "recording", 49 * S), null);
  assert.deepEqual(decideUpdate(state, segments, "recording", 50 * S), { final: false });
});

test("failure: retry after 10 s, then 30 s, then every 60 s", () => {
  assert.equal(retryDelayMs(1), 10 * S);
  assert.equal(retryDelayMs(2), 30 * S);
  assert.equal(retryDelayMs(3), 60 * S);
  assert.equal(retryDelayMs(9), 60 * S);

  let state = beginRequest(createLiveDocState(), 0);
  state = applyFailure(state, 1000, "boom");
  assert.equal(state.failures, 1);
  assert.equal(state.inFlight, false);
  assert.equal(state.nextRetryAt, 11 * S);
  state = applyFailure(beginRequest(state, 11 * S), 12 * S, "boom");
  assert.equal(state.nextRetryAt, 12 * S + 30 * S);
  state = applyFailure(beginRequest(state, 42 * S), 43 * S, "boom");
  assert.equal(state.nextRetryAt, 43 * S + 60 * S);
});

test("failure: the sent turns stay pending", () => {
  const segments = [seg("a", "hello")];
  let state = createLiveDocState();
  const built = buildRequest(state, segments, "en", false)!;
  state = applyFailure(beginRequest(state, 0), 1000, "x");
  assert.deepEqual([...pendingIdsOf(segments, state)], built.sentIds);
});

test("status: error from the 3rd consecutive failure, cleared by a success", () => {
  const segments = [seg("a", "hello")];
  let state = createLiveDocState();
  state = applyFailure(state, 0, "x");
  state = applyFailure(state, 0, "x");
  assert.equal(deriveStatus(state, segments), "waiting");
  state = applyFailure(state, 0, "raw server text");
  assert.equal(deriveStatus(state, segments), "error");
  assert.equal(state.errorDetail, "raw server text");
  // An error keeps showing while the retry is in flight.
  assert.equal(deriveStatus({ ...state, inFlight: true }, segments), "error");

  const built = buildRequest(state, segments, "en", false)!;
  state = applySuccess(state, built, [{ markdown: "## A\n- hi", closed: false }]);
  assert.equal(state.failures, 0);
  assert.equal(state.errorDetail, undefined);
  assert.equal(deriveStatus(state, segments), "idle");
});

test("status: idle, waiting, updating", () => {
  const state = createLiveDocState();
  assert.equal(deriveStatus(state, []), "idle");
  assert.equal(deriveStatus(state, [seg("a", "x")]), "waiting");
  assert.equal(deriveStatus(state, [seg("a", "x", { final: false })]), "idle");
  assert.equal(deriveStatus(beginRequest(state, 0), [seg("a", "x")]), "updating");
});

// ----- request building -------------------------------------------------------------------

test("request: outline from closed sections, open section text, turns with clock and speaker", () => {
  const state = afterRequestAt(0, {
    sections: [
      { id: "ld-1", markdown: "## Úvod\n- bod", closed: true },
      { id: "ld-2", markdown: "### odd\n## Budget\n- x", closed: true },
      { id: "ld-3", markdown: "## Termíny\n- [[P1]] Navrhuje", closed: false },
    ],
  });
  const segments = [
    seg("a", "  Ahoj  ", { speaker: "P2", startSec: 761 }),
    seg("b", "bez hovoriaceho", { startSec: 3725 }),
  ];
  const built = buildRequest(state, segments, "sk", false)!;
  assert.deepEqual(built.request, {
    language: "sk",
    outline: ["Úvod", "Budget"],
    open_section: "## Termíny\n- [[P1]] Navrhuje",
    turns: [
      { speaker: "P2", at: "12:41", text: "Ahoj" },
      { at: "1:02:05", text: "bez hovoriaceho" },
    ],
    final: false,
  });
  assert.deepEqual(built.sentIds, ["a", "b"]);
});

test("request: a closed last section means an empty open section", () => {
  const state = afterRequestAt(0, { sections: [{ id: "ld-1", markdown: "## A", closed: true }] });
  const built = buildRequest(state, [seg("a", "x")], "en", false)!;
  assert.equal(built.request.open_section, "");
  assert.deepEqual(built.request.outline, ["A"]);
});

test("request: nothing pending means nothing to send, except the final close of an open section", () => {
  assert.equal(buildRequest(createLiveDocState(), [], "en", false), null);
  assert.equal(buildRequest(createLiveDocState(), [], "en", true), null);
  const state = afterRequestAt(0, { sections: [{ id: "ld-1", markdown: "## A\n- x", closed: false }] });
  assert.equal(buildRequest(state, [], "en", false), null);
  const closing = buildRequest(state, [], "en", true)!;
  assert.equal(closing.request.final, true);
  assert.deepEqual(closing.request.turns, []);
  assert.equal(closing.request.open_section, "## A\n- x");
});

test("request: at most 80 turns and 12000 characters, the oldest first; the rest stays pending", () => {
  const many = Array.from({ length: 100 }, (_, i) => seg(`s${i}`, `t${i}`));
  const a = buildRequest(createLiveDocState(), many, "en", false)!;
  assert.equal(a.request.turns.length, 80);
  assert.equal(a.sentIds[0], "s0");
  assert.equal(a.sentIds[79], "s79");

  const long = [seg("x", "a".repeat(7000)), seg("y", "b".repeat(7000)), seg("z", "c")];
  const b = buildRequest(createLiveDocState(), long, "en", false)!;
  assert.deepEqual(b.sentIds, ["x"]);

  // One enormous turn still goes (cut), so it cannot block the queue.
  const huge = buildRequest(createLiveDocState(), [seg("h", "q".repeat(MAX_TURN_CHARS + 500))], "en", false)!;
  assert.equal(huge.request.turns[0].text.length, MAX_TURN_CHARS);
});

test("request: the outline keeps the newest 40 headings", () => {
  const sections = Array.from({ length: 45 }, (_, i) => ({ id: `ld-${i}`, markdown: `## H${i}\n- x`, closed: true }));
  const built = buildRequest(afterRequestAt(0, { sections }), [seg("a", "x")], "en", false)!;
  assert.equal(built.request.outline.length, 40);
  assert.equal(built.request.outline[0], "H5");
  assert.equal(built.request.outline[39], "H44");
});

test("sectionHeading", () => {
  assert.equal(sectionHeading("## Rozpočet projektu Nova\n- x"), "Rozpočet projektu Nova");
  assert.equal(sectionHeading("no heading"), "");
  assert.equal(sectionHeading(""), "");
});

// ----- applying the response --------------------------------------------------------------

test("response: the first section keeps the open section's id; sent ids become consumed", () => {
  let state = afterRequestAt(0, {
    sections: [
      { id: "ld-1", markdown: "## Done", closed: true },
      { id: "ld-2", markdown: "## Open\n- a", closed: false },
    ],
    idCounter: 2,
  });
  const segments = [seg("a", "x"), seg("b", "y")];
  const built = buildRequest(state, segments, "en", false)!;
  state = applySuccess(beginRequest(state, 5 * S), built, [
    { markdown: "## Open\n- a\n- b", closed: true },
    { markdown: "## Next\n- c", closed: false },
  ]);
  assert.deepEqual(
    state.sections.map((s) => [s.id, s.closed]),
    [
      ["ld-1", true],
      ["ld-2", true],
      ["ld-3", false],
    ],
  );
  assert.equal(state.sections[1].markdown, "## Open\n- a\n- b");
  assert.deepEqual([...state.consumedIds].sort(), ["a", "b"]);
  assert.equal(state.inFlight, false);
  assert.equal(state.lastRequestAt, 5 * S);
  assert.deepEqual([...pendingIdsOf(segments, state)], []);
});

test("response: with no open section the answer is appended with new ids", () => {
  let state = afterRequestAt(0, { sections: [{ id: "ld-1", markdown: "## Done", closed: true }], idCounter: 1 });
  const built = buildRequest(state, [seg("a", "x")], "en", false)!;
  state = applySuccess(state, built, [{ markdown: "## New\n- x", closed: false }]);
  assert.deepEqual(
    state.sections.map((s) => s.id),
    ["ld-1", "ld-2"],
  );
  assert.equal(state.sections[1].closed, false);
});

test("response: only the last section may stay open, whatever the server says", () => {
  const state = createLiveDocState();
  const built = buildRequest(state, [seg("a", "x")], "en", false)!;
  const next = applySuccess(state, built, [
    { markdown: "## A", closed: false },
    { markdown: "## B", closed: false },
  ]);
  assert.deepEqual(
    next.sections.map((s) => s.closed),
    [true, false],
  );
});

test("final close: everything is closed, finalDone is set, and the machine stops", () => {
  let state = createLiveDocState();
  const segments = [seg("a", "x")];
  const built = buildRequest(state, segments, "en", true)!;
  assert.equal(built.request.final, true);
  state = applySuccess(beginRequest(state, 0), built, [{ markdown: "## A\n- x", closed: false }]);
  assert.equal(state.finalDone, true);
  assert.deepEqual(
    state.sections.map((s) => s.closed),
    [true],
  );
  assert.equal(decideUpdate(state, segments, "stopped", 99 * S), null);
});

test("parseResponseSections", () => {
  assert.deepEqual(parseResponseSections({ success: true, sections: [{ markdown: " ## A ", closed: true }, { markdown: "", closed: false }, { markdown: "## B" }] }), [
    { markdown: "## A", closed: true },
    { markdown: "## B", closed: false },
  ]);
  assert.equal(parseResponseSections({ sections: [] }), null);
  assert.equal(parseResponseSections({}), null);
  assert.equal(parseResponseSections(null), null);
});

// ----- reset ------------------------------------------------------------------------------

test("reset: on none, and when the segments are emptied after having content", () => {
  assert.equal(shouldResetDocument(5, 5, "none"), true);
  assert.equal(shouldResetDocument(5, 0, "recording"), true);
  assert.equal(shouldResetDocument(0, 0, "recording"), false);
  assert.equal(shouldResetDocument(5, 6, "recording"), false);
  assert.equal(shouldResetDocument(5, 5, "stopped"), false);
});

test("pristine state is recognised, a used one is not", () => {
  assert.equal(isPristine(createLiveDocState()), true);
  assert.equal(isPristine(beginRequest(createLiveDocState(), 1)), false);
  assert.equal(isPristine({ ...createLiveDocState(), sections: [{ id: "x", markdown: "## A", closed: true }] }), false);
});

// ----- speaker tokens (C1.4) --------------------------------------------------------------

test("splitSpeakerTokens: a token at the start of a bullet", () => {
  assert.deepEqual(splitSpeakerTokens("- [[P2]] Navrhuje posunúť termín"), [
    { kind: "text", text: "- " },
    { kind: "speaker", id: "P2" },
    { kind: "text", text: "Navrhuje posunúť termín" },
  ]);
});

test("splitSpeakerTokens: token first, several tokens, token alone, two digits", () => {
  assert.deepEqual(splitSpeakerTokens("[[P1]] Hello **bold**"), [
    { kind: "speaker", id: "P1" },
    { kind: "text", text: "Hello **bold**" },
  ]);
  assert.deepEqual(splitSpeakerTokens("[[P1]] a [[P12]] b"), [
    { kind: "speaker", id: "P1" },
    { kind: "text", text: "a " },
    { kind: "speaker", id: "P12" },
    { kind: "text", text: "b" },
  ]);
  assert.deepEqual(splitSpeakerTokens("[[P3]]"), [{ kind: "speaker", id: "P3" }]);
  assert.deepEqual(splitSpeakerTokens("[[P99]] x"), [
    { kind: "speaker", id: "P99" },
    { kind: "text", text: "x" },
  ]);
});

test("splitSpeakerTokens: no token, empty line, and tokens outside the grammar stay text", () => {
  assert.deepEqual(splitSpeakerTokens("plain line"), [{ kind: "text", text: "plain line" }]);
  assert.deepEqual(splitSpeakerTokens(""), []);
  for (const bad of ["[[P0]] x", "[[P100]] x", "[[P]] x", "[[p1]] x", "[[Participant 1]] x", "[P1] x", "[[P1] x"]) {
    assert.deepEqual(splitSpeakerTokens(bad), [{ kind: "text", text: bad }], bad);
  }
});

test("splitSpeakerTokens: only one space after a token belongs to it", () => {
  assert.deepEqual(splitSpeakerTokens("[[P1]]  two"), [
    { kind: "speaker", id: "P1" },
    { kind: "text", text: " two" },
  ]);
});
