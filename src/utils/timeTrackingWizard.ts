/**
 * The time-tracking step inside the module setup wizard. Pure: no React, no fetch.
 *
 * Hours basis, the employer multiplier and the extension switch are a partial
 * settings patch (the server keeps every field we do not send). Who tracks time
 * is the role permission `time_tracking` — people who share a role move together,
 * and the Admin role is never written because an administrator always has every
 * permission.
 */

import type { RolePermission } from "../types";
import { computeCostRate, type CostSettings } from "./timeCost.ts";
import { findRole, isAdminRoleName, resolvePermissionValue, withPermission } from "./permissions.ts";
import { DEFAULT_TIME_TRACKING_SETTINGS, type TimeTrackingSettings } from "./timeTracking.ts";

export interface TimeWizardUser {
  id: string;
  name: string;
  role: string;
}

export interface TimeWizardDraft {
  hoursBasis: "workingDays" | "fixed";
  fixedHoursPerMonth: number;
  hoursPerDay: number;
  employerMultiplier: number;
  extensionEnabled: boolean;
  /** User ids whose role should have `time_tracking` at edit. Admins are always here. */
  trackingUserIds: string[];
}

export type TimeWizardField =
  | "hoursBasis"
  | "fixedHoursPerMonth"
  | "hoursPerDay"
  | "employerMultiplier"
  | "extensionEnabled"
  | "tracking";

/** What Confirm may POST. `extension` carries only `enabled`, so activity capture stays as stored. */
export interface TimeWizardSettingsPatch {
  hoursBasis?: TimeWizardDraft["hoursBasis"];
  fixedHoursPerMonth?: number;
  hoursPerDay?: number;
  employerMultiplier?: number;
  extension?: { enabled: boolean };
}

/** The worked example in the step: a monthly employee, 22 working days (C7.2). */
export const TIME_WIZARD_EXAMPLE_SALARY = 3200;
export const TIME_WIZARD_EXAMPLE_DAYS = 22;

const clamp = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export const clampTimeWizardDraft = (draft: TimeWizardDraft): TimeWizardDraft => ({
  ...draft,
  hoursBasis: draft.hoursBasis === "fixed" ? "fixed" : "workingDays",
  fixedHoursPerMonth: clamp(draft.fixedHoursPerMonth, 1, 744, DEFAULT_TIME_TRACKING_SETTINGS.fixedHoursPerMonth),
  hoursPerDay: clamp(draft.hoursPerDay, 1, 24, DEFAULT_TIME_TRACKING_SETTINGS.hoursPerDay),
  employerMultiplier: clamp(draft.employerMultiplier, 0.5, 5, DEFAULT_TIME_TRACKING_SETTINGS.employerMultiplier),
  extensionEnabled: !!draft.extensionEnabled,
  trackingUserIds: draft.trackingUserIds,
});

const costSettingsOf = (draft: TimeWizardDraft): CostSettings => {
  const clamped = clampTimeWizardDraft(draft);
  return {
    hoursBasis: clamped.hoursBasis,
    fixedHoursPerMonth: clamped.fixedHoursPerMonth,
    hoursPerDay: clamped.hoursPerDay,
    employerMultiplier: clamped.employerMultiplier,
  };
};

/** Hourly cost of the example salary at the draft's basis and multiplier. Null when the numbers cannot price it. */
export const timeWizardExampleRate = (draft: TimeWizardDraft): number | null =>
  computeCostRate(
    { kind: "employee", salaryType: "monthly", salaryAmount: TIME_WIZARD_EXAMPLE_SALARY },
    TIME_WIZARD_EXAMPLE_DAYS,
    costSettingsOf(draft),
  ).rate;

const roleKey = (role: string | null | undefined): string => (role || "").trim().toLowerCase();

/** Checked when the role already resolves `time_tracking` to edit. Admins are always checked. */
export const initialTrackingIds = (users: readonly TimeWizardUser[], roles: readonly RolePermission[]): string[] =>
  users
    .filter((user) => {
      if (!user.id) return false;
      if (isAdminRoleName(user.role)) return true;
      const role = findRole(roles as RolePermission[], user.role);
      if (!role) return false;
      return resolvePermissionValue(role.permissions, "time_tracking") === "edit";
    })
    .map((user) => user.id);

export const draftFromSettings = (
  settings: Partial<TimeTrackingSettings> | null | undefined,
  users: readonly TimeWizardUser[],
  roles: readonly RolePermission[],
): TimeWizardDraft => {
  const merged = { ...DEFAULT_TIME_TRACKING_SETTINGS, ...(settings ?? {}) };
  const extension = { ...DEFAULT_TIME_TRACKING_SETTINGS.extension, ...(settings?.extension ?? {}) };
  return clampTimeWizardDraft({
    hoursBasis: merged.hoursBasis === "fixed" ? "fixed" : "workingDays",
    fixedHoursPerMonth: merged.fixedHoursPerMonth,
    hoursPerDay: merged.hoursPerDay,
    employerMultiplier: merged.employerMultiplier,
    extensionEnabled: extension.enabled !== false,
    trackingUserIds: initialTrackingIds(users, roles),
  });
};

const sameIds = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

/**
 * A click selects or clears every non-admin who shares that role. Admins stay selected.
 * Returns the ids in user-list order.
 */
export const toggleTrackingUser = (
  users: readonly TimeWizardUser[],
  selectedIds: readonly string[],
  userId: string,
): string[] => {
  const user = users.find((u) => u.id === userId);
  if (!user || isAdminRoleName(user.role)) {
    return users.filter((u) => selectedIds.includes(u.id) || isAdminRoleName(u.role)).map((u) => u.id);
  }
  const key = roleKey(user.role);
  const cohort = users.filter((u) => !isAdminRoleName(u.role) && roleKey(u.role) === key).map((u) => u.id);
  const selected = new Set(selectedIds);
  const turnOn = !selected.has(userId);
  for (const id of cohort) {
    if (turnOn) selected.add(id);
    else selected.delete(id);
  }
  for (const u of users) if (isAdminRoleName(u.role)) selected.add(u.id);
  return users.filter((u) => selected.has(u.id)).map((u) => u.id);
};

/**
 * Roles to store after Confirm. Unchanged role objects are the same references.
 * Returns the same array when nothing would be written, so the caller can skip the sync.
 * A mixed role (some people checked, some not) is left alone — the checkbox keeps a role together.
 */
export const rolesAfterTrackingChoice = (
  roles: readonly RolePermission[],
  users: readonly TimeWizardUser[],
  selectedIds: readonly string[],
): RolePermission[] => {
  const selected = new Set(selectedIds);
  const members = new Map<string, TimeWizardUser[]>();
  for (const user of users) {
    if (!user.id || isAdminRoleName(user.role)) continue;
    const key = roleKey(user.role);
    if (!key) continue;
    const list = members.get(key) ?? [];
    list.push(user);
    members.set(key, list);
  }
  let changed = false;
  const next = roles.map((role) => {
    if (isAdminRoleName(role.name)) return role;
    const group = members.get(roleKey(role.name));
    if (!group || group.length === 0) return role;
    const allOn = group.every((u) => selected.has(u.id));
    const allOff = group.every((u) => !selected.has(u.id));
    if (!allOn && !allOff) return role;
    const desired = allOn ? "edit" : "nothing";
    if (resolvePermissionValue(role.permissions, "time_tracking") === desired) return role;
    changed = true;
    return withPermission(role, "time_tracking", desired);
  });
  return changed ? next : (roles as RolePermission[]);
};

/** Only fields the admin changed, and only when the value differs from what was loaded. */
export const patchDirtyFields = (
  baseline: TimeWizardDraft,
  draft: TimeWizardDraft,
  dirty: ReadonlySet<TimeWizardField>,
): TimeWizardSettingsPatch | null => {
  const next = clampTimeWizardDraft(draft);
  const prev = clampTimeWizardDraft(baseline);
  const patch: TimeWizardSettingsPatch = {};
  if (dirty.has("hoursBasis") && next.hoursBasis !== prev.hoursBasis) patch.hoursBasis = next.hoursBasis;
  if (dirty.has("fixedHoursPerMonth") && next.fixedHoursPerMonth !== prev.fixedHoursPerMonth) {
    patch.fixedHoursPerMonth = next.fixedHoursPerMonth;
  }
  if (dirty.has("hoursPerDay") && next.hoursPerDay !== prev.hoursPerDay) patch.hoursPerDay = next.hoursPerDay;
  if (dirty.has("employerMultiplier") && next.employerMultiplier !== prev.employerMultiplier) {
    patch.employerMultiplier = next.employerMultiplier;
  }
  if (dirty.has("extensionEnabled") && next.extensionEnabled !== prev.extensionEnabled) {
    patch.extension = { enabled: next.extensionEnabled };
  }
  return Object.keys(patch).length > 0 ? patch : null;
};

export const trackingChoiceChanged = (baselineIds: readonly string[], draftIds: readonly string[]): boolean =>
  !sameIds(baselineIds, draftIds);

/** Server settings replace the fields the admin has not touched. Tracking ids stay. */
export const applyLoadedSettings = (
  baseline: TimeWizardDraft,
  draft: TimeWizardDraft,
  dirty: ReadonlySet<TimeWizardField>,
  settings: Partial<TimeTrackingSettings> | null | undefined,
): { baseline: TimeWizardDraft; draft: TimeWizardDraft } => {
  const loaded = draftFromSettings(settings, [], []);
  const nextBase: TimeWizardDraft = {
    ...baseline,
    hoursBasis: loaded.hoursBasis,
    fixedHoursPerMonth: loaded.fixedHoursPerMonth,
    hoursPerDay: loaded.hoursPerDay,
    employerMultiplier: loaded.employerMultiplier,
    extensionEnabled: loaded.extensionEnabled,
  };
  const nextDraft: TimeWizardDraft = {
    ...draft,
    hoursBasis: dirty.has("hoursBasis") ? draft.hoursBasis : loaded.hoursBasis,
    fixedHoursPerMonth: dirty.has("fixedHoursPerMonth") ? draft.fixedHoursPerMonth : loaded.fixedHoursPerMonth,
    hoursPerDay: dirty.has("hoursPerDay") ? draft.hoursPerDay : loaded.hoursPerDay,
    employerMultiplier: dirty.has("employerMultiplier") ? draft.employerMultiplier : loaded.employerMultiplier,
    extensionEnabled: dirty.has("extensionEnabled") ? draft.extensionEnabled : loaded.extensionEnabled,
  };
  return { baseline: nextBase, draft: nextDraft };
};

/** A later user list refreshes who is checked, unless the admin already used the checklist. */
export const applyLoadedUsers = (
  baseline: TimeWizardDraft,
  draft: TimeWizardDraft,
  dirty: ReadonlySet<TimeWizardField>,
  users: readonly TimeWizardUser[],
  roles: readonly RolePermission[],
): { baseline: TimeWizardDraft; draft: TimeWizardDraft } => {
  const ids = initialTrackingIds(users, roles);
  return {
    baseline: { ...baseline, trackingUserIds: ids },
    draft: { ...draft, trackingUserIds: dirty.has("tracking") ? draft.trackingUserIds : ids },
  };
};
