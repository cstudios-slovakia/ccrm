import test from "node:test";
import assert from "node:assert/strict";
import { countWorkingDays, errorTranslationKey, isPendingLeave, toApiResult, visibleTabs } from "./myEmployment.ts";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

test("a successful answer is the payload", async () => {
  const r = await toApiResult<{ success: true; x: number }>(response(200, { success: true, x: 1 }));
  assert.deepEqual(r, { ok: true, data: { success: true, x: 1 } });
});

test("an error answer is its stable code, never the server text", async () => {
  const r = await toApiResult(response(409, { success: false, code: "overlap", message: "Do not render me" }));
  assert.deepEqual(r, { ok: false, code: "overlap", status: 409 });
});

test("not_linked comes back as a failure with its code even at HTTP 200", async () => {
  const r = await toApiResult(response(200, { success: false, code: "not_linked" }));
  assert.deepEqual(r, { ok: false, code: "not_linked", status: 200 });
});

test("a network failure and an unreadable body are handled", async () => {
  assert.deepEqual(await toApiResult(Promise.reject(new Error("offline"))), { ok: false, code: "network", status: 0 });
  const garbage = await toApiResult(Promise.resolve(new Response("<html>", { status: 500 })));
  assert.deepEqual(garbage, { ok: false, code: "generic", status: 500 });
});

test("known codes map to their sentence, unknown ones to the generic one", () => {
  assert.equal(errorTranslationKey("overlap"), "myEmployment.error.overlap");
  assert.equal(errorTranslationKey("network"), "myEmployment.error.network");
  assert.equal(errorTranslationKey("something_new"), "myEmployment.error.generic");
});

test("only requested or pending leave can be cancelled", () => {
  assert.equal(isPendingLeave("requested"), true);
  assert.equal(isPendingLeave("pending"), true);
  assert.equal(isPendingLeave("approved"), false);
  assert.equal(isPendingLeave("rejected"), false);
});

test("working days count Monday to Friday, inclusively", () => {
  assert.equal(countWorkingDays("2026-12-07", "2026-12-11"), 5);
  assert.equal(countWorkingDays("2026-12-05", "2026-12-06"), 0);
  assert.equal(countWorkingDays("2026-12-04", "2026-12-07"), 2);
  assert.equal(countWorkingDays("2026-12-11", "2026-12-07"), 0);
  assert.equal(countWorkingDays("nope", "2026-12-07"), 0);
});

test("the tabs follow what the server allows", () => {
  const none = { profile: false, editProfile: false, payroll: false, leave: false, requestLeave: false, files: false, hours: false };
  assert.deepEqual(visibleTabs(none), []);
  assert.deepEqual(visibleTabs({ ...none, profile: true, leave: true, hours: true }), ["personal", "leave", "hours"]);
  assert.deepEqual(
    visibleTabs({ ...none, profile: true, payroll: true, leave: true, files: true, hours: true }),
    ["personal", "payroll", "leave", "documents", "hours"]
  );
});
