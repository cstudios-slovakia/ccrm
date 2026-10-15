import { isAdminRoleName } from "./permissions.ts";
import { hasStoredPrefs } from "./userPrefs.ts";
import type { UserPrefs } from "./userPrefs.ts";

/**
 * Decisions behind the module setup wizard, kept free of React so they can be
 * tested (moduleWizard.test.ts).
 *
 * Which modules are visible is WORKSPACE data (`integrationsConfig.disabledModules`,
 * the same field Settings -> Visible Modules edits). Whether a given admin has
 * been shown the wizard is PER USER (`UserPrefs.moduleWizardCompletedAt`).
 */

type UserLike = { role?: string | null; metadata_json?: unknown } | null | undefined;

/**
 * Browser-side traces that this browser has been used to run the app before.
 * `theme` is deliberately not one: the login screen lets a visitor pick a
 * palette before they have an account, so it says nothing about prior use.
 */
const NON_USAGE_LEGACY_KEYS = new Set<keyof UserPrefs>(["theme"]);

/**
 * Should the first-login preferences migration mark this user as needing the
 * wizard?
 *
 * "New" means *this account has no `preferences` blob at all*, which is exactly
 * the condition the migration in App.tsx already uses to decide it has never
 * seen the user. That is the only moment it can be observed: the migration
 * writes the blob a few hundred milliseconds after the session loads, so by the
 * time a component could ask `hasStoredPrefs()` the answer is always "yes".
 * Deciding inside the migration, and storing the verdict as a flag, is what
 * makes the signal survive.
 *
 * Why not "everyone who has no completed flag"? Because every admin on an
 * existing install lacks it the day this version ships, and none of them should
 * have a popup sprung on them. Existing accounts already carry a blob, so they
 * are never marked.
 *
 * Two guards keep the signal honest:
 *  - only admins: the wizard writes workspace-wide settings;
 *  - a browser that still holds pre-migration preferences (see readLegacyPrefs)
 *    belongs to someone who has used the app, even if their account never
 *    reached the migration.
 *
 * A known blind spot: an admin who has not signed in since preferences moved to
 * the database (v1.9.x) is indistinguishable from a new account, and gets the
 * wizard once. It can be dismissed with "Decide later".
 */
export const shouldMarkModuleWizardPending = (
  user: UserLike,
  legacyPrefs: Partial<UserPrefs> = {}
): boolean => {
  if (!user || !isAdminRoleName(user.role)) return false;
  if (hasStoredPrefs(user)) return false;
  const hasUsageTraces = (Object.keys(legacyPrefs) as Array<keyof UserPrefs>).some(
    (key) => !NON_USAGE_LEGACY_KEYS.has(key)
  );
  return !hasUsageTraces;
};

/**
 * Should the wizard open by itself right now? Re-checks the role, because a
 * session can outlive a demotion and the wizard changes workspace settings.
 */
export const shouldShowModuleWizard = (
  user: UserLike,
  prefs: Pick<UserPrefs, "moduleWizardPending" | "moduleWizardCompletedAt">
): boolean =>
  !!user && isAdminRoleName(user.role) && prefs.moduleWizardPending === true && !prefs.moduleWizardCompletedAt;

/* ------------------------------------------------------------------ draft */

/**
 * Seeds the wizard's draft from the workspace's current state. Only ids that
 * the catalog actually lists are kept: the draft is what the admin sees and
 * edits, nothing else.
 */
export const draftFromDisabled = (disabledModules: readonly string[], catalogIds: readonly string[]): string[] => {
  const known = new Set(catalogIds);
  return Array.from(new Set(disabledModules.filter((id) => known.has(id))));
};

export const toggleInDraft = (draft: readonly string[], id: string): string[] =>
  draft.includes(id) ? draft.filter((d) => d !== id) : [...draft, id];

/**
 * What to write on Confirm. Ids that are disabled in the workspace but missing
 * from the catalog — an archived dashboard, say — are carried over untouched, so
 * restoring one later brings back the state it had. This mirrors Settings,
 * which only ever adds and removes the one id being toggled.
 */
export const mergeDraftIntoDisabled = (
  currentDisabled: readonly string[],
  draft: readonly string[],
  catalogIds: readonly string[]
): string[] => {
  const known = new Set(catalogIds);
  const unlisted = currentDisabled.filter((id) => !known.has(id));
  return Array.from(new Set([...unlisted, ...draft.filter((id) => known.has(id))]));
};

export const countActive = (draft: readonly string[], catalogIds: readonly string[]): number => {
  const hidden = new Set(draft);
  return catalogIds.filter((id) => !hidden.has(id)).length;
};

/**
 * With every module hidden, the sidebar and the Start menu render no entries at
 * all (both filter the same list), leaving an admin with a blank navigation and
 * only the settings link to find their way back. Confirm is therefore refused
 * when nothing would stay visible.
 */
export const canConfirmDraft = (draft: readonly string[], catalogIds: readonly string[]): boolean =>
  catalogIds.length === 0 || countActive(draft, catalogIds) > 0;
