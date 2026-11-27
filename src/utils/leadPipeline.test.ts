import assert from "node:assert/strict";
import test from "node:test";
import { LEAD_PIPELINE_UNREACHED_CLASS, makeLeadPipeline } from "./leadPipeline.ts";

const t = (en: string) => en;

// Shaped like the client in the bug report: Slovak names, so nothing is closed
// by an English name; substates; and "Nekontaktovať", which this customer files
// under closed (another could keep it in progress: it is their call, made in Settings).
const config = {
  leadStates: ["Nový", "Nekontaktovať", "Cenová ponuka", "V procese", "Odoslaná", "Záväzná", "Odmietnutá", "Prijatá"],
  leadStageGroups: {
    "nový": "new",
    "nekontaktovať": "closed",
    "cenová ponuka": "in_progress",
    "v procese": "in_progress",
    "odoslaná": "in_progress",
    "záväzná": "in_progress",
    "odmietnutá": "closed",
    "prijatá": "closed",
  },
  leadStateParents: { "v procese": "cenová ponuka" },
  leadStateColors: { "nový": "#111111", "cenová ponuka": "#222222", "odmietnutá": "#ff0000" },
  t,
};

const titles = (segs: { title: string }[]) => segs.map((s) => s.title);

test("only main, open states are steps; closed ones share one outcome", () => {
  const segs = makeLeadPipeline(config)("nový");
  assert.deepEqual(titles(segs), ["Nový", "Cenová ponuka", "Odoslaná", "Záväzná", "Closed"]);
  assert.equal(segs[4].tooltip, "Closed (Nekontaktovať / Odmietnutá / Prijatá)");
  assert.equal(segs[4].filled, false);
  assert.equal(segs[4].colorClass, LEAD_PIPELINE_UNREACHED_CLASS);
});

test("a substate lights its parent, which reads Parent › Substate", () => {
  const segs = makeLeadPipeline(config)("v procese");
  assert.deepEqual(titles(segs), ["Nový", "Cenová ponuka › V procese", "Odoslaná", "Záväzná", "Closed"]);
  assert.deepEqual(segs.map((s) => s.filled), [true, true, false, false, false]);
  assert.deepEqual(segs.map((s) => !!s.current), [false, true, false, false, false]);
  assert.equal(segs[1].color, "#222222");
});

test("a closed state found by its stage group ends the strip in its colour", () => {
  const segs = makeLeadPipeline(config)("odmietnutá");
  assert.deepEqual(titles(segs), ["Nový", "Cenová ponuka", "Odoslaná", "Záväzná", "Odmietnutá"]);
  assert.ok(segs.every((s) => s.filled));
  assert.equal(segs[4].current, true);
  assert.equal(segs[4].color, "#ff0000");
});

test("a status the customer filed under closed is an outcome, not a step", () => {
  const segs = makeLeadPipeline(config)("nekontaktovať");
  assert.deepEqual(titles(segs), ["Nový", "Cenová ponuka", "Odoslaná", "Záväzná", "Nekontaktovať"]);
  assert.equal(segs[4].current, true);
});

test("an empty or unknown status reaches nothing", () => {
  for (const status of ["", null, "gone"]) {
    const segs = makeLeadPipeline(config)(status);
    assert.ok(segs.every((s) => !s.filled && !s.current), String(status));
  }
});

test("built-in closed names still close a lead without a stage group", () => {
  const segs = makeLeadPipeline({ leadStates: ["new", "contacted", "accepted", "rejected"], t })("rejected");
  assert.deepEqual(titles(segs), ["new", "contacted", "rejected"]);
  assert.ok(segs.every((s) => s.filled));
});
