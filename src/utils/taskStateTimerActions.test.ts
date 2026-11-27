import test from "node:test";
import assert from "node:assert/strict";
import {
  removeTimerActionKey,
  renameTimerActionKey,
  sanitizeTimerActions,
  suggestTimerActions,
} from "./taskStateTimerActions.ts";

test("sanitize keeps valid actions and drops junk and unknown statuses", () => {
  const raw = { A: "start", B: "nope", C: "stop", D: "pause" };
  assert.deepEqual(sanitizeTimerActions(raw), { A: "start", C: "stop", D: "pause" });
  assert.deepEqual(sanitizeTimerActions(raw, ["A", "B"]), { A: "start" });
  assert.deepEqual(sanitizeTimerActions(null), {});
  assert.deepEqual(sanitizeTimerActions(["start"]), {});
});

test("rename moves the action, delete removes it", () => {
  assert.deepEqual(renameTimerActionKey({ A: "start" }, "A", "B"), { B: "start" });
  const same = { A: "start" } as const;
  assert.equal(renameTimerActionKey(same, "X", "Y"), same);
  assert.deepEqual(removeTimerActionKey({ A: "start", B: "stop" }, "A"), { B: "stop" });
});

test("suggestion maps In progress to start and the last status to stop", () => {
  assert.deepEqual(suggestTimerActions(["New", "In progress", "Blocked", "Done"]), { "In progress": "start", Done: "stop" });
  assert.deepEqual(suggestTimerActions(["Nové", "Rozpracované", "Hotové"]), { "Rozpracované": "start", "Hotové": "stop" });
  assert.deepEqual(suggestTimerActions(["Új", "Folyamatban"]), { Folyamatban: "start" });
  assert.deepEqual(suggestTimerActions(["A", "B"]), { B: "stop" });
});
