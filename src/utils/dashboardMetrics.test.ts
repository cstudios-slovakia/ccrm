import assert from "node:assert/strict";
import test from "node:test";
import { isActivePipelineLead, isPipelineLead, isWonLeadState, leadKpis, type MetricLead } from "./dashboardMetrics.ts";

const groups = {
  new: "new", contacted: "new", "price offer sent": "in_progress",
  accepted: "closed", lost: "closed", rejected: "closed", "nezáujem – stratené": "closed", "zmluva podpísaná": "closed",
};

test("won means a closed stage that is not a loss", () => {
  assert.equal(isWonLeadState("accepted", groups), true);
  assert.equal(isWonLeadState("Won"), true);
  assert.equal(isWonLeadState("zmluva podpísaná", groups), true);
  assert.equal(isWonLeadState("lost", groups), false);
  assert.equal(isWonLeadState("rejected", groups), false);
  assert.equal(isWonLeadState("nezáujem – stratené", groups), false);
  assert.equal(isWonLeadState("contacted", groups), false);
});

test("a substate inherits the loss of its parent", () => {
  assert.equal(isWonLeadState("too expensive", { ...groups, "too expensive": "closed" }, { "too expensive": "lost" }), false);
});

test("client records, archived rows and the documents placeholder are not pipeline leads", () => {
  assert.equal(isPipelineLead({ id: "client-inv-002", status: "active", value: 0 }), false);
  assert.equal(isPipelineLead({ id: "lead-1", status: "new", value: 0, adjustment: 50 }), false);
  assert.equal(isPipelineLead({ id: "lead-1", status: "new", value: 0, archived: true }), false);
  assert.equal(isPipelineLead({ id: "unassigned-docs", status: "new", value: 0 }), false);
  assert.equal(isPipelineLead({ id: "lead-1", status: "new", value: 0 }), true);
});

test("a client whose status is no pipeline stage is not an active lead", () => {
  assert.equal(isActivePipelineLead({ id: "client-inv-006", status: "client", value: 0 }, groups), false);
  assert.equal(isActivePipelineLead({ id: "lead-2", status: "price offer sent", value: 0 }, groups), true);
});

test("the overview cards: active excludes clients, won excludes lost, conversion is won of all", () => {
  const leads: MetricLead[] = [
    { id: "lead-1", status: "new", value: 0 },
    { id: "lead-2", status: "price offer sent", value: 1000 },
    { id: "lead-3", status: "accepted", value: 500 },
    { id: "lead-4", status: "lost", value: 700 },
    { id: "lead-5", status: "rejected", value: 300 },
    { id: "client-inv-002", status: "active", value: 0 },
    { id: "client-sf-1", status: "accepted", value: 0 },
  ];
  const k = leadKpis(leads, groups);
  assert.equal(k.total, 5);
  assert.deepEqual(k.active, { count: 2, value: 1000 });
  assert.deepEqual(k.won, { count: 1, value: 500 });
  assert.equal(k.conversionPct, 20);
});

test("no leads, no division by zero", () => {
  assert.equal(leadKpis([], groups).conversionPct, 0);
});
