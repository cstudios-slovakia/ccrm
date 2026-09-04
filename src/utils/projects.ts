/*
  How a project is named, and how its deadline is doing.

  Two questions every project list, card and header asks, and none of them
  should answer for itself:

  - What is this project called? Projects never had a name. They borrowed the
    paired lead's, which left a project paired with nobody literally unnameable
    ("Nový projekt" for all of them). They now carry their own `name`, prefilled
    from the lead when one is picked and free to diverge afterwards; the lead
    stays the fallback so the projects created before this landed still read the
    way they always did.

  - Is it late? A deadline belongs to the project TYPE first (`hasDeadline`):
    a type that is not time-boxed shows no deadline field and no countdown
    anywhere, the same opt-in shape `hasTimeline` and `hasGantt` already use.
    The type also sets how many days ahead a project starts warning, which is
    what turns the countdown badge amber before it turns red.

  `today` is passed in ("YYYY-MM-DD") so every caller on one screen shares a
  single clock and the tests do not depend on the day they run — the same
  contract as evaluateLeadSla in utils/leadSla.ts.
*/

import type { Lead, Project, ProjectType } from "../types";

const DAY_MS = 86400000;

// Days since the epoch for a "YYYY-MM-DD..." string, read as a plain calendar
// date. Going through UTC midnight keeps the difference between two dates whole
// across a DST boundary, which `new Date(str)` arithmetic does not.
const toDayNumber = (value: string | undefined | null): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
};

/** The date part of a "YYYY-MM-DD..." value, or "" when it is not one. */
const toDateOnly = (value: string | undefined | null): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return m ? m[1] : "";
};

/** What a new deadline-enabled project type warns at, before anyone edits it. */
export const DEFAULT_DEADLINE_WARNING_DAYS = 7;

/**
 * A warning window, cleaned up: a positive whole number of days, or 0 for
 * "no early warning, only flag it once it is actually late".
 */
export const normalizeDeadlineWarningDays = (raw: unknown): number => {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // A year ahead is well past anything meaningful and keeps a fat-fingered
  // paste out of the stored project type.
  return Math.min(Math.floor(n), 365);
};

/**
 * "overdue" — past the deadline. "soon" — inside the warning window.
 * "ok" — still comfortably ahead. "closed" — the project is finished or
 * abandoned, so its date is worth showing but not worth shouting about.
 */
export type ProjectDeadlineTone = "overdue" | "soon" | "ok" | "closed";

export interface ProjectDeadlineStatus {
  /** The deadline as "YYYY-MM-DD". */
  deadline: string;
  /** Whole days until it; negative once it has passed. */
  daysLeft: number;
  /** Days past the deadline; 0 while still ahead of it. */
  overdueDays: number;
  /** The type's warning window, normalized. */
  warningDays: number;
  tone: ProjectDeadlineTone;
  isOverdue: boolean;
  isDueSoon: boolean;
}

/** Statuses that stop a deadline from being a deadline. */
const isClosedProject = (status: string | undefined): boolean =>
  status === "completed" || status === "cancelled";

/**
 * The project's deadline state, or null when there is nothing to say — the type
 * is not time-boxed, no date is set, or the date is unreadable. Callers render
 * nothing at all on null rather than an empty badge.
 */
export const evaluateProjectDeadline = (
  project: Pick<Project, "deadline" | "status"> | undefined | null,
  projectType: Pick<ProjectType, "hasDeadline" | "deadlineWarningDays"> | undefined | null,
  today: string,
): ProjectDeadlineStatus | null => {
  if (!projectType?.hasDeadline) return null;

  const deadline = toDateOnly(project?.deadline);
  const deadlineDay = toDayNumber(deadline);
  const todayDay = toDayNumber(today);
  if (deadlineDay === null || todayDay === null) return null;

  const warningDays = normalizeDeadlineWarningDays(projectType.deadlineWarningDays);
  const daysLeft = deadlineDay - todayDay;

  // A delivered project that ran late is history, not a fire. Colouring it red
  // forever would leave the list permanently alarming and make the projects
  // that are genuinely late impossible to pick out.
  const closed = isClosedProject(project?.status);
  const isOverdue = !closed && daysLeft < 0;
  const isDueSoon = !closed && !isOverdue && warningDays > 0 && daysLeft <= warningDays;

  return {
    deadline,
    daysLeft,
    overdueDays: Math.max(0, -daysLeft),
    warningDays,
    tone: closed ? "closed" : isOverdue ? "overdue" : isDueSoon ? "soon" : "ok",
    isOverdue,
    isDueSoon,
  };
};

/**
 * What to call this project on screen: its own name, else the paired lead's,
 * else whatever the caller wants to say about a project with neither (the
 * callers pass a translated "New project" / "Untitled project").
 */
export const projectDisplayName = (
  project: Pick<Project, "name" | "leadId"> | undefined | null,
  leads: Pick<Lead, "id" | "name">[],
  fallback: string,
): string => {
  const own = String(project?.name ?? "").trim();
  if (own) return own;
  const leadId = project?.leadId;
  const lead = leadId ? leads.find((l) => l.id === leadId) : undefined;
  return String(lead?.name ?? "").trim() || fallback;
};
