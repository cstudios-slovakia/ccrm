import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmDraft,
  countActive,
  draftFromDisabled,
  mergeDraftIntoDisabled,
  shouldMarkModuleWizardPending,
  shouldShowModuleWizard,
  toggleInDraft,
} from "./moduleWizard.ts";
import { DEFAULT_USER_PREFS } from "./userPrefs.ts";

const admin = { role: "Admin", metadata_json: undefined as unknown };
const withPrefs = (role: string) => ({ role, metadata_json: JSON.stringify({ preferences: { theme: "basic" } }) });

test("a brand-new admin (no preferences blob) is marked for the wizard", () => {
  assert.equal(shouldMarkModuleWizardPending(admin), true);
  assert.equal(shouldMarkModuleWizardPending({ role: "admin", metadata_json: "{}" }), true);
  assert.equal(shouldMarkModuleWizardPending({ role: " ADMIN ", metadata_json: { emailSettings: {} } }), true);
});

test("an existing admin, who already has a preferences blob, is never marked", () => {
  assert.equal(shouldMarkModuleWizardPending(withPrefs("Admin")), false);
  // An empty blob still counts: it means the account has been through the migration.
  assert.equal(shouldMarkModuleWizardPending({ role: "Admin", metadata_json: JSON.stringify({ preferences: {} }) }), false);
});

test("a new account that is not an admin is never marked", () => {
  assert.equal(shouldMarkModuleWizardPending({ role: "Manager", metadata_json: "{}" }), false);
  assert.equal(shouldMarkModuleWizardPending({ role: "Employee" }), false);
  assert.equal(shouldMarkModuleWizardPending({ role: "" }), false);
  assert.equal(shouldMarkModuleWizardPending(null), false);
  assert.equal(shouldMarkModuleWizardPending(undefined), false);
});

test("a browser holding pre-migration preferences belongs to someone who has used the app", () => {
  assert.equal(shouldMarkModuleWizardPending(admin, { seenUpdateId: "u-12" }), false);
  assert.equal(shouldMarkModuleWizardPending(admin, { leadsVisibleStates: ["new"] }), false);
  // A palette picked on the login screen says nothing about prior use.
  assert.equal(shouldMarkModuleWizardPending(admin, { theme: "ocean" }), true);
  assert.equal(shouldMarkModuleWizardPending(admin, {}), true);
});

test("a new admin on a workspace that is already in use is never marked", () => {
  // Another account has been through its first login: this is not the installation.
  assert.equal(shouldMarkModuleWizardPending(admin, {}, { otherUsers: [withPrefs("Admin")] }), false);
  assert.equal(shouldMarkModuleWizardPending(admin, {}, { otherUsers: [{ role: "Manager", metadata_json: "{}" }, withPrefs("Employee")] }), false);
  // The setup was already dealt with, whoever did it.
  assert.equal(shouldMarkModuleWizardPending(admin, {}, { setupCompletedAt: "2026-10-15T08:00:00.000Z" }), false);
});

test("the first admin is marked even when other accounts exist but have never signed in", () => {
  const neverSignedIn = [{ role: "Manager", metadata_json: "{}" }, { role: "Admin", metadata_json: undefined as unknown }];
  assert.equal(shouldMarkModuleWizardPending(admin, {}, { otherUsers: neverSignedIn }), true);
  assert.equal(shouldMarkModuleWizardPending(admin, {}, { otherUsers: [], setupCompletedAt: null }), true);
});

test("the wizard does not open once the workspace setup is stamped, even for a pending admin", () => {
  const pending = { ...DEFAULT_USER_PREFS, moduleWizardPending: true };
  assert.equal(shouldShowModuleWizard(admin, pending, { setupCompletedAt: "2026-10-15T08:00:00.000Z" }), false);
  assert.equal(shouldShowModuleWizard(admin, pending, { setupCompletedAt: null }), true);
});

test("the wizard shows only for an admin whose pending flag is set and not yet completed", () => {
  const pending = { ...DEFAULT_USER_PREFS, moduleWizardPending: true };
  assert.equal(shouldShowModuleWizard(admin, pending), true);
  assert.equal(shouldShowModuleWizard(admin, { ...pending, moduleWizardCompletedAt: "2026-10-15T08:00:00.000Z" }), false);
  assert.equal(shouldShowModuleWizard(admin, DEFAULT_USER_PREFS), false);
});

test("the wizard never opens for a non-admin, even with the flag set", () => {
  const pending = { ...DEFAULT_USER_PREFS, moduleWizardPending: true };
  assert.equal(shouldShowModuleWizard({ role: "Manager" }, pending), false);
  assert.equal(shouldShowModuleWizard({ role: "Employee" }, pending), false);
  assert.equal(shouldShowModuleWizard(null, pending), false);
});

test("an existing install's defaults do not open the wizard", () => {
  // What an upgraded admin reads: a blob written before the flag existed.
  assert.equal(shouldShowModuleWizard(withPrefs("Admin"), DEFAULT_USER_PREFS), false);
});

const IDS = ["tasks", "projects", "leads", "dash_a"];

test("the draft starts from the workspace's current state, not from 'everything on'", () => {
  assert.deepEqual(draftFromDisabled(["leads", "projects"], IDS), ["leads", "projects"]);
  assert.deepEqual(draftFromDisabled([], IDS), []);
});

test("the draft ignores ids the catalog does not list", () => {
  assert.deepEqual(draftFromDisabled(["leads", "dash_gone", "leads"], IDS), ["leads"]);
});

test("toggling adds then removes an id, and never mutates its input", () => {
  const start = ["leads"];
  const off = toggleInDraft(start, "tasks");
  assert.deepEqual(off, ["leads", "tasks"]);
  assert.deepEqual(start, ["leads"]);
  assert.deepEqual(toggleInDraft(off, "tasks"), ["leads"]);
});

test("confirming keeps disabled ids the catalog no longer lists", () => {
  // dash_old belongs to an archived dashboard; un-archiving it must restore the old state.
  assert.deepEqual(
    mergeDraftIntoDisabled(["dash_old", "leads"], ["tasks"], IDS).sort(),
    ["dash_old", "tasks"].sort()
  );
});

test("confirming writes exactly the draft for listed ids, deduplicated", () => {
  assert.deepEqual(mergeDraftIntoDisabled(["leads"], [], IDS), []);
  assert.deepEqual(mergeDraftIntoDisabled([], ["tasks", "tasks", "projects"], IDS), ["tasks", "projects"]);
  assert.deepEqual(mergeDraftIntoDisabled([], ["nope"], IDS), []);
});

test("active count is the catalog minus the draft", () => {
  assert.equal(countActive([], IDS), 4);
  assert.equal(countActive(["tasks", "leads"], IDS), 2);
  assert.equal(countActive(IDS, IDS), 0);
});

test("confirm is refused only when every listed module would be hidden", () => {
  assert.equal(canConfirmDraft(IDS, IDS), false);
  assert.equal(canConfirmDraft(["tasks", "projects", "leads"], IDS), true);
  assert.equal(canConfirmDraft([], IDS), true);
  // An empty catalog has nothing to hide, so there is nothing to refuse.
  assert.equal(canConfirmDraft([], []), true);
});
