import test from "node:test";
import assert from "node:assert/strict";
import type { AcceptanceCriterion } from "../types/index.ts";
import {
  addCriterion,
  approveScope,
  countCriteria,
  isAddedAfterApproval,
  liveCriteria,
  removeCriterion,
  renameCriterion,
  toggleCriterionDone,
  withdrawScopeApproval,
} from "./acceptanceCriteria.ts";

const T0 = new Date("2026-11-10T09:00:00.000Z");
const T1 = new Date("2026-11-12T09:00:00.000Z");
const crit = (id: string, over: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion => ({
  id, title: id, done: false, createdAt: T0.toISOString(), createdBy: "Anna", removedAt: null, removedBy: null, ...over,
});

test("addCriterion appends a live criterion with the given user and instant, and never mutates", () => {
  const before = [crit("a")];
  const after = addCriterion(before, { id: "b", title: "  Login works  " }, "Boris", T1);
  assert.equal(before.length, 1);
  assert.deepEqual(after[1], {
    id: "b", title: "Login works", done: false, createdAt: "2026-11-12T09:00:00.000Z", createdBy: "Boris", removedAt: null, removedBy: null,
  });
});

test("addCriterion ignores an empty title and works on an absent list", () => {
  assert.deepEqual(addCriterion(undefined, { id: "x", title: "   " }, "A", T0), []);
  assert.equal(addCriterion(null, { id: "x", title: "T" }, null, T0)[0].createdBy, null);
});

test("renameCriterion changes one title; an empty title or unknown id changes nothing", () => {
  const list = [crit("a"), crit("b")];
  assert.equal(renameCriterion(list, "b", " New ")[1].title, "New");
  assert.deepEqual(renameCriterion(list, "b", "  "), list);
  assert.deepEqual(renameCriterion(list, "zzz", "New"), list);
});

test("toggleCriterionDone flips a live criterion and leaves a removed one alone", () => {
  const list = [crit("a"), crit("b", { removedAt: T1.toISOString() })];
  assert.equal(toggleCriterionDone(list, "a")[0].done, true);
  assert.equal(toggleCriterionDone(toggleCriterionDone(list, "a"), "a")[0].done, false);
  assert.equal(toggleCriterionDone(list, "b")[1].done, false);
});

test("removeCriterion is soft: the criterion stays with removedAt and removedBy", () => {
  const list = [crit("a"), crit("b")];
  const next = removeCriterion(list, "a", "Boris", T1);
  assert.equal(next.length, 2);
  assert.equal(next[0].removedAt, T1.toISOString());
  assert.equal(next[0].removedBy, "Boris");
  assert.deepEqual(liveCriteria(next).map((c) => c.id), ["b"]);
  // removing it again keeps the first removal
  assert.equal(removeCriterion(next, "a", "Carl", new Date("2026-12-01T00:00:00Z"))[0].removedBy, "Boris");
});

test("approveScope gives a patch with the user and instant; a second approval changes nothing", () => {
  assert.deepEqual(approveScope({}, "Anna", T0), { scopeApprovedAt: "2026-11-10T09:00:00.000Z", scopeApprovedBy: "Anna" });
  assert.deepEqual(approveScope({ scopeApprovedAt: T0.toISOString(), scopeApprovedBy: "Anna" }, "Boris", T1), {});
});

test("withdrawScopeApproval clears both fields", () => {
  assert.deepEqual(withdrawScopeApproval(), { scopeApprovedAt: null, scopeApprovedBy: null });
});

test("isAddedAfterApproval: strictly after the approval, compared in whole seconds", () => {
  const approved = "2026-11-10T09:00:00.000Z";
  assert.equal(isAddedAfterApproval({ createdAt: "2026-11-10T09:00:01.000Z" }, approved), true);
  assert.equal(isAddedAfterApproval({ createdAt: "2026-11-10T09:00:00.999Z" }, approved), false); // same second
  assert.equal(isAddedAfterApproval({ createdAt: "2026-11-10T09:00:00.000Z" }, "2026-11-10T09:00:00.700Z"), false);
  assert.equal(isAddedAfterApproval({ createdAt: null }, approved), false); // no createdAt: original scope
  assert.equal(isAddedAfterApproval({ createdAt: "2026-11-09T09:00:00.000Z" }, approved), false);
  assert.equal(isAddedAfterApproval({ createdAt: "2026-11-12T09:00:00Z" }, null), false);
  assert.equal(isAddedAfterApproval({ createdAt: "garbage" }, approved), false);
});

test("countCriteria counts live criteria only, split at the approval", () => {
  const list = [
    crit("a"),
    crit("b"),
    crit("c", { createdAt: T1.toISOString() }),
    crit("d", { createdAt: T1.toISOString(), removedAt: T1.toISOString() }),
    crit("e", { removedAt: T1.toISOString() }),
  ];
  assert.deepEqual(countCriteria(list, T0.toISOString()), { original: 2, added: 1 });
  assert.deepEqual(countCriteria(list, null), { original: 3, added: 0 });
  assert.deepEqual(countCriteria(undefined, T0.toISOString()), { original: 0, added: 0 });
});
