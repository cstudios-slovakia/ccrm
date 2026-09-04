import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLeadSla,
  leadPhaseEnteredAt,
  normalizeLeadStateSla,
  normalizeSlaDays,
} from "./leadSla.ts";
import type { Lead } from "../types/index.ts";

const GROUPS: Record<string, string> = {
  new: "new",
  contacted: "in_progress",
  "offer sent": "in_progress",
  accepted: "closed",
  rejected: "closed",
};

const lead = (over: Partial<Lead> = {}): Lead =>
  ({
    id: "l1",
    name: "Acme",
    city: "",
    clientType: "business",
    status: "contacted",
    source: "web",
    owner: "Sam",
    value: 0,
    createdAt: "2026-09-01",
    ...over,
  }) as Lead;

test("a limit is a positive whole number of days, or nothing", () => {
  assert.equal(normalizeSlaDays(3), 3);
  assert.equal(normalizeSlaDays("3"), 3);
  assert.equal(normalizeSlaDays(2.7), 2);
  assert.equal(normalizeSlaDays(0), 0);
  assert.equal(normalizeSlaDays(-5), 0);
  assert.equal(normalizeSlaDays(""), 0);
  assert.equal(normalizeSlaDays(undefined), 0);
  assert.equal(normalizeSlaDays("nonsense"), 0);
  assert.equal(normalizeSlaDays(99999), 3650);
});

test("the normalized map has one spelling of 'empty', so the settings signature cannot flip-flop", () => {
  // computeSettingsSig in App.tsx compares this against what the server echoes
  // back; two representations of the same thing would push settings forever.
  assert.deepEqual(normalizeLeadStateSla(undefined), {});
  assert.deepEqual(normalizeLeadStateSla(null), {});
  assert.deepEqual(normalizeLeadStateSla([]), {});
  assert.deepEqual(normalizeLeadStateSla("off"), {});
  assert.deepEqual(normalizeLeadStateSla({ contacted: 0 }), {});
  assert.equal(
    JSON.stringify(normalizeLeadStateSla({ "Offer Sent": "5", contacted: 3 })),
    JSON.stringify(normalizeLeadStateSla({ contacted: 3, "offer sent": 5 })),
  );
});

test("the phase starts at the newest state change, whatever order the timeline is in", () => {
  assert.equal(
    leadPhaseEnteredAt(
      lead({
        timeline: [
          { id: "a", type: "status_change", timestamp: "2026-08-20 09:00", title: "", content: "" },
          { id: "b", type: "note", timestamp: "2026-08-30 09:00", title: "", content: "" },
          { id: "c", type: "status_change", timestamp: "2026-08-25 17:30", title: "", content: "" },
        ],
      }),
    ),
    "2026-08-25 17:30",
  );
});

test("a lead that never moved is measured from when it arrived", () => {
  assert.equal(leadPhaseEnteredAt(lead({ createdAt: "2026-08-01" })), "2026-08-01");
  assert.equal(
    leadPhaseEnteredAt(
      lead({
        createdAt: "2026-08-01",
        timeline: [{ id: "a", type: "note", timestamp: "2026-08-20 09:00", title: "", content: "" }],
      }),
    ),
    "2026-08-01",
  );
});

test("the day the limit is reached is still inside it; the next one is not", () => {
  const sla = { contacted: 3 };
  const l = lead({ createdAt: "2026-09-01" });
  const onTime = evaluateLeadSla(l, sla, GROUPS, {}, "2026-09-04");
  assert.equal(onTime?.daysInPhase, 3);
  assert.equal(onTime?.isBreached, false);
  assert.equal(onTime?.overdueDays, 0);

  const late = evaluateLeadSla(l, sla, GROUPS, {}, "2026-09-06");
  assert.equal(late?.daysInPhase, 5);
  assert.equal(late?.isBreached, true);
  assert.equal(late?.overdueDays, 2);
  assert.equal(late?.limitDays, 3);
});

test("nothing is tracked without a limit for the lead's own phase", () => {
  assert.equal(evaluateLeadSla(lead(), {}, GROUPS, {}, "2026-09-30"), null);
  assert.equal(
    evaluateLeadSla(lead({ status: "new" }), { contacted: 1 }, GROUPS, {}, "2026-09-30"),
    null,
  );
});

test("a closed phase is terminal, so its limit never fires", () => {
  const sla = { accepted: 1, "waiting on signature": 1 };
  assert.equal(evaluateLeadSla(lead({ status: "accepted" }), sla, GROUPS, {}, "2026-09-30"), null);
  // Also when the phase is closed only through its parent.
  assert.equal(
    evaluateLeadSla(
      lead({ status: "waiting on signature" }),
      sla,
      GROUPS,
      { "waiting on signature": "accepted" },
      "2026-09-30",
    ),
    null,
  );
});

test("an unreadable date is reported as nothing to say, not as a breach", () => {
  assert.equal(
    evaluateLeadSla(lead({ createdAt: "" }), { contacted: 1 }, GROUPS, {}, "2026-09-30"),
    null,
  );
  assert.equal(
    evaluateLeadSla(lead(), { contacted: 1 }, GROUPS, {}, "not a date"),
    null,
  );
});

test("a clock behind the timeline reads as zero days in the phase, never negative", () => {
  const status = evaluateLeadSla(
    lead({ createdAt: "2026-09-10" }),
    { contacted: 3 },
    GROUPS,
    {},
    "2026-09-01",
  );
  assert.equal(status?.daysInPhase, 0);
  assert.equal(status?.isBreached, false);
});
