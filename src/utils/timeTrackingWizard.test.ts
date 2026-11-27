import assert from "node:assert/strict";
import test from "node:test";
import type { RolePermission } from "../types";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "./timeTracking.ts";
import {
  applyLoadedSettings,
  applyLoadedUsers,
  draftFromSettings,
  initialTrackingIds,
  patchDirtyFields,
  rolesAfterTrackingChoice,
  timeWizardExampleRate,
  toggleTrackingUser,
  trackingChoiceChanged,
  type TimeWizardUser,
} from "./timeTrackingWizard.ts";

const admin: TimeWizardUser = { id: "u-admin", name: "Ada", role: "Admin" };
const erik: TimeWizardUser = { id: "u-erik", name: "Erik", role: "Employee" };
const mia: TimeWizardUser = { id: "u-mia", name: "Mia", role: "Employee" };
const intern: TimeWizardUser = { id: "u-intern", name: "Ivan", role: "Intern" };
const users = [admin, erik, mia, intern];

const employeeRole: RolePermission = { name: "Employee", permissions: { tasks: "edit" } };
const internRole: RolePermission = { name: "Intern", permissions: { time_tracking: "nothing" } };
const adminRole: RolePermission = { name: "Admin", permissions: {} };
const roles = [adminRole, employeeRole, internRole];

test("the example rate matches the monthly employee fixture at the default multiplier", () => {
  const draft = draftFromSettings(null, users, roles);
  assert.equal(draft.hoursBasis, "workingDays");
  assert.equal(draft.hoursPerDay, 8);
  assert.equal(draft.employerMultiplier, 1.352);
  assert.equal(draft.extensionEnabled, true);
  // €3,200 / 22 working days / 8 h × 1.352. The rate is kept at 4 decimals (€24.5818);
  // the step shows it as €24.58/h, the same rounding as the settings example (C7.2).
  assert.equal(timeWizardExampleRate(draft), 24.5818);
});

test("a fixed hour basis prices the example from those hours, not from 22 days", () => {
  const draft = draftFromSettings({ hoursBasis: "fixed", fixedHoursPerMonth: 160 }, [], []);
  assert.equal(draft.hoursBasis, "fixed");
  assert.equal(draft.fixedHoursPerMonth, 160);
  // €3,200 / 160 h × 1.352 = €27.04/h.
  assert.equal(timeWizardExampleRate(draft), 27.04);
});

test("an out-of-range multiplier is clamped before the example and the patch", () => {
  const baseline = draftFromSettings(null, [], []);
  const draft = { ...baseline, employerMultiplier: 99 };
  assert.equal(timeWizardExampleRate(draft), timeWizardExampleRate({ ...baseline, employerMultiplier: 5 }));
  const patch = patchDirtyFields(baseline, draft, new Set(["employerMultiplier"]));
  assert.deepEqual(patch, { employerMultiplier: 5 });
});

test("who tracks time starts from the role, and administrators are always included", () => {
  // Employee has no stored time_tracking key, so the legacy default (edit) applies.
  assert.deepEqual(initialTrackingIds(users, roles), ["u-admin", "u-erik", "u-mia"]);
  assert.deepEqual(initialTrackingIds([{ id: "u-x", name: "No role", role: "Ghost" }], roles), []);
});

test("checking one person checks everyone with the same role, and an admin cannot be cleared", () => {
  const start = initialTrackingIds(users, roles);
  const off = toggleTrackingUser(users, start, "u-erik");
  assert.deepEqual(off, ["u-admin"]);
  assert.deepEqual(toggleTrackingUser(users, off, "u-mia"), ["u-admin", "u-erik", "u-mia"]);
  assert.deepEqual(toggleTrackingUser(users, off, "u-admin"), ["u-admin"]);
});

test("Confirm writes time_tracking only on roles whose people all moved, and never on Admin", () => {
  const off = toggleTrackingUser(users, initialTrackingIds(users, roles), "u-erik");
  const next = rolesAfterTrackingChoice(roles, users, off);
  assert.notEqual(next, roles);
  assert.equal(next[0], adminRole);
  assert.equal(next[1].permissions.time_tracking, "nothing");
  assert.equal(next[2], internRole);
  // Putting the employees back matches the legacy default, so nothing is written.
  const back = toggleTrackingUser(users, off, "u-erik");
  assert.equal(rolesAfterTrackingChoice(roles, users, back), roles);
});

test("a mixed checklist does not change the role", () => {
  const mixed = rolesAfterTrackingChoice(roles, users, ["u-admin", "u-erik"]);
  assert.equal(mixed, roles);
});

test("the settings patch sends only fields that changed, and the extension flag alone", () => {
  const baseline = draftFromSettings(
    { hoursBasis: "fixed", fixedHoursPerMonth: 160, extension: { enabled: true, activityCaptureAllowed: false, unsortedRetentionDays: 14 } },
    [],
    [],
  );
  assert.equal(baseline.extensionEnabled, true);
  assert.equal(patchDirtyFields(baseline, baseline, new Set(["hoursBasis", "employerMultiplier"])), null);
  const turnedOff = { ...baseline, extensionEnabled: false, hoursBasis: "workingDays" as const };
  assert.deepEqual(patchDirtyFields(baseline, turnedOff, new Set(["extensionEnabled"])), {
    extension: { enabled: false },
  });
  assert.deepEqual(patchDirtyFields(baseline, turnedOff, new Set(["hoursBasis"])), { hoursBasis: "workingDays" });
});

test("loaded settings fill untouched fields and leave a field the admin already edited", () => {
  const baseline = draftFromSettings(null, users, roles);
  const edited = { ...baseline, employerMultiplier: 1.2 };
  const dirty = new Set(["employerMultiplier"] as const);
  const loaded = applyLoadedSettings(baseline, edited, dirty, {
    ...DEFAULT_TIME_TRACKING_SETTINGS,
    hoursBasis: "fixed",
    fixedHoursPerMonth: 150,
    employerMultiplier: 1.5,
    extension: { enabled: false, activityCaptureAllowed: true, unsortedRetentionDays: 30 },
  });
  assert.equal(loaded.baseline.hoursBasis, "fixed");
  assert.equal(loaded.baseline.employerMultiplier, 1.5);
  assert.equal(loaded.baseline.extensionEnabled, false);
  assert.equal(loaded.draft.hoursBasis, "fixed");
  assert.equal(loaded.draft.employerMultiplier, 1.2);
  assert.equal(loaded.draft.extensionEnabled, false);
  assert.deepEqual(loaded.draft.trackingUserIds, baseline.trackingUserIds);
});

test("a user list that arrives later checks people unless the checklist was already used", () => {
  const empty = draftFromSettings(null, [], []);
  const arrived = applyLoadedUsers(empty, empty, new Set(), users, roles);
  assert.deepEqual(arrived.draft.trackingUserIds, ["u-admin", "u-erik", "u-mia"]);
  const touched = applyLoadedUsers(empty, { ...empty, trackingUserIds: ["u-admin"] }, new Set(["tracking"]), users, roles);
  assert.deepEqual(touched.baseline.trackingUserIds, ["u-admin", "u-erik", "u-mia"]);
  assert.deepEqual(touched.draft.trackingUserIds, ["u-admin"]);
  assert.equal(trackingChoiceChanged(touched.baseline.trackingUserIds, touched.draft.trackingUserIds), true);
  assert.equal(trackingChoiceChanged(["a", "b"], ["b", "a"]), false);
});
