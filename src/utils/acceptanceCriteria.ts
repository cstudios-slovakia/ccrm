/**
 * Acceptance criteria of a project and its scope approval: the pure rules.
 *
 * A project has a list of criteria and one scope approval. A criterion created after the approval is
 * scope creep (the dashboard's "Scope creep" widget). Removal is soft: the criterion stays in the list
 * with `removedAt` set, so history is not lost. Every function returns a new array; the user name and
 * the instant are parameters, nothing here reads the clock. The approval itself is not edited here: the
 * server stamps it through its own action (api/project_scope_action.php, src/utils/projectScopeApi.ts).
 * Withdrawing it is a reset: when the scope is approved again, the criteria added so far count as
 * original scope, not as creep.
 */

import type { AcceptanceCriterion } from "../types/index.ts";
import { parseAppDate } from "./performance/period.ts";

/** The title as stored: surrounding space removed, at most 300 characters (the server's limit). */
export const cleanCriterionTitle = (title: string): string => title.trim().slice(0, 300);

/** The criteria that are not removed, in list order. */
export const liveCriteria = (list: readonly AcceptanceCriterion[] | null | undefined): AcceptanceCriterion[] =>
  (list ?? []).filter((c) => !c.removedAt);

/** Adds a live, not yet done criterion at the end. An empty title leaves the list as it is. */
export const addCriterion = (
  list: readonly AcceptanceCriterion[] | null | undefined,
  input: { id: string; title: string },
  userName: string | null,
  now: Date,
): AcceptanceCriterion[] => {
  const title = cleanCriterionTitle(input.title);
  const current = list ?? [];
  if (!title) return [...current];
  return [
    ...current,
    { id: input.id, title, done: false, createdAt: now.toISOString(), createdBy: userName || null, removedAt: null, removedBy: null },
  ];
};

/** Renames one criterion. An empty title or an unknown id leaves the list as it is. */
export const renameCriterion = (
  list: readonly AcceptanceCriterion[] | null | undefined,
  id: string,
  title: string,
): AcceptanceCriterion[] => {
  const next = cleanCriterionTitle(title);
  return (list ?? []).map((c) => (c.id === id && next ? { ...c, title: next } : c));
};

/** Flips the done flag of one live criterion. */
export const toggleCriterionDone = (
  list: readonly AcceptanceCriterion[] | null | undefined,
  id: string,
): AcceptanceCriterion[] => (list ?? []).map((c) => (c.id === id && !c.removedAt ? { ...c, done: !c.done } : c));

/** Soft removal: the criterion stays with `removedAt` / `removedBy`. Removing a removed one changes nothing. */
export const removeCriterion = (
  list: readonly AcceptanceCriterion[] | null | undefined,
  id: string,
  userName: string | null,
  now: Date,
): AcceptanceCriterion[] =>
  (list ?? []).map((c) => (c.id === id && !c.removedAt ? { ...c, removedAt: now.toISOString(), removedBy: userName || null } : c));

/**
 * Was the criterion created strictly after the approval instant, compared in whole seconds (the server
 * stamps both to the second, so the browser's milliseconds must not decide)? False without a readable
 * approval or creation time: a criterion without `createdAt` is original scope.
 */
export const isAddedAfterApproval = (
  criterion: Pick<AcceptanceCriterion, "createdAt">,
  scopeApprovedAt: string | null | undefined,
): boolean => {
  const approved = parseAppDate(scopeApprovedAt);
  const created = parseAppDate(criterion.createdAt);
  return approved !== null && created !== null && Math.floor(created.getTime() / 1000) > Math.floor(approved.getTime() / 1000);
};

/** Live criteria that were part of the approved scope and live criteria added after it. Without an approval everything is "original". */
export const countCriteria = (
  list: readonly AcceptanceCriterion[] | null | undefined,
  scopeApprovedAt: string | null | undefined,
): { original: number; added: number } => {
  let added = 0;
  const live = liveCriteria(list);
  for (const c of live) if (isAddedAfterApproval(c, scopeApprovedAt)) added += 1;
  return { original: live.length - added, added };
};
