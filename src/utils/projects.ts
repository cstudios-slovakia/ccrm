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

import type { Lead, Project, ProjectStatus, ProjectType } from "../types";

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
export type ProjectDeadlineTone = "overdue" | "soon" | "ok" | "closed" | "finished";

export interface ProjectDeadlineStatus {
  /**
   * The date that represents the project, "YYYY-MM-DD": the real finish date
   * when one is set, else the planned deadline. What lists show and sort by.
   */
  deadline: string;
  /** The planned deadline, "" when there is none. */
  plannedDeadline: string;
  /** The real finish date, "" while the project has not been marked finished. */
  finishedAt: string;
  /** Finished this many days after the planned deadline; 0 when on time or unknown. */
  finishedLateDays: number;
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
  project: Pick<Project, "deadline" | "status" | "finishedAt"> | undefined | null,
  projectType: Pick<ProjectType, "hasDeadline" | "deadlineWarningDays"> | undefined | null,
  today: string,
): ProjectDeadlineStatus | null => {
  if (!projectType?.hasDeadline) return null;

  const deadline = toDateOnly(project?.deadline);
  const deadlineDay = toDayNumber(deadline);
  const todayDay = toDayNumber(today);
  const warningDays = normalizeDeadlineWarningDays(projectType.deadlineWarningDays);

  // A real finish date is the truth and outranks the plan: the project is done
  // and nothing counts down. Whether it missed the plan is recorded in
  // finishedLateDays, which still asks for a delay reason.
  const finishedAt = toDateOnly(project?.finishedAt);
  const finishedDay = toDayNumber(finishedAt);
  if (finishedDay !== null) {
    const late = deadlineDay === null ? 0 : Math.max(0, finishedDay - deadlineDay);
    return {
      deadline: finishedAt,
      plannedDeadline: deadline,
      finishedAt,
      finishedLateDays: late,
      daysLeft: todayDay === null ? 0 : finishedDay - todayDay,
      overdueDays: 0,
      warningDays,
      tone: "finished",
      isOverdue: false,
      isDueSoon: false,
    };
  }

  if (deadlineDay === null || todayDay === null) return null;

  const daysLeft = deadlineDay - todayDay;

  // A delivered project that ran late is history, not a fire. Colouring it red
  // forever would leave the list permanently alarming and make the projects
  // that are genuinely late impossible to pick out.
  const closed = isClosedProject(project?.status);
  const isOverdue = !closed && daysLeft < 0;
  const isDueSoon = !closed && !isOverdue && warningDays > 0 && daysLeft <= warningDays;

  return {
    deadline,
    plannedDeadline: deadline,
    finishedAt: "",
    finishedLateDays: 0,
    daysLeft,
    overdueDays: Math.max(0, -daysLeft),
    warningDays,
    tone: closed ? "closed" : isOverdue ? "overdue" : isDueSoon ? "soon" : "ok",
    isOverdue,
    isDueSoon,
  };
};

/**
 * When the project really started, "YYYY-MM-DD": the date set by hand, else
 * the day it was created, else "" (a project not yet saved has neither).
 */
export const projectStartDate = (
  project: Pick<Project, "startDate" | "createdAt"> | undefined | null,
): string => toDateOnly(project?.startDate) || toDateOnly(project?.createdAt);

/**
 * The real finish date after a status change. Completing a project without a
 * finish date stamps `today`; an existing date (set by hand) is kept. Moving it
 * back to an open status clears the date, because a finish date on a project
 * still in progress would keep showing it as finished in every list.
 * Cancelled leaves the date as it was.
 */
export const finishedAtForStatus = (
  nextStatus: string,
  finishedAt: string | null | undefined,
  today: string,
): string => {
  const current = toDateOnly(finishedAt);
  if (nextStatus === "completed") return current || toDateOnly(today);
  if (nextStatus === "cancelled") return current;
  return "";
};

/*
  ── THE RED FLAG ────────────────────────────────────────

  A missed deadline is noticed by the badge above. What it could not do was
  make anyone account for it: a project could sit weeks past its date with the
  whole story living in someone's head. Once a project is genuinely late it
  carries a mandatory `delayReason`, and until that is written down the project
  wears a red flag in the list and refuses to be saved from its own card.

  A missed deadline asks for it: still open and past the date, or finished
  after it. On time, or closed without a late finish, has nothing to explain.
  evaluateProjectDeadline() is the single judge of which is which.
*/

/** The delay reason as stored, trimmed; "" when there is none. */
export const projectDelayReason = (
  project: Pick<Project, "delayReason"> | undefined | null,
): string => String(project?.delayReason ?? "").trim();

/**
 * True when the project missed its planned date: still open and past it, or
 * finished after it. Both cases owe a delay reason; a real finish date does
 * not wipe the debt.
 */
export const projectMissedDeadline = (
  deadline: ProjectDeadlineStatus | null | undefined,
): boolean => !!deadline?.isOverdue || (deadline?.finishedLateDays ?? 0) > 0;

/**
 * True when this project missed its deadline and nobody has said why yet.
 * Pass the deadline verdict the caller already computed, so a list and a card
 * looking at the same project can never disagree.
 */
export const projectNeedsDelayReason = (
  project: Pick<Project, "delayReason"> | undefined | null,
  deadline: ProjectDeadlineStatus | null | undefined,
): boolean => projectMissedDeadline(deadline) && projectDelayReason(project) === "";

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

/*
  ── PROJECT STATUS ──────────────────────────────────────

  The list itself is PROJECT_STATUSES in types/index.ts. What lives here is how
  a status is spoken and how it is painted, because five places used to carry
  their own copy of both — the projects filter, the projects table, the project
  card, the project drawer and the lead's "Linked projects" card — and a new
  status reached exactly none of them.
*/

/** Where every project starts. Nothing promotes it out of here on its own — see PROJECT_STATUSES. */
export const DEFAULT_PROJECT_STATUS: ProjectStatus = "new";

/**
 * en / sk / hu, in the shape every view's local `t()` takes.
 *
 * Written out in PROJECT_STATUSES order, because the key order is what the
 * dropdowns are built from below — a runtime `import { PROJECT_STATUSES }` here
 * would be a directory import that node's test runner cannot resolve. The
 * `Record<ProjectStatus, …>` keeps the two lists exhaustive against each other,
 * and projects.test.ts asserts they agree on order too.
 */
const PROJECT_STATUS_LABELS: Record<ProjectStatus, [string, string, string]> = {
  new: ["New", "Nový", "Új"],
  active: ["Active", "Aktívny", "Aktív"],
  completed: ["Completed", "Dokončený", "Befejezett"],
  on_hold: ["On Hold", "Pozastavený", "Függőben"],
  cancelled: ["Cancelled", "Zrušený", "Törölt"],
};

const isProjectStatus = (status: string): status is ProjectStatus =>
  Object.prototype.hasOwnProperty.call(PROJECT_STATUS_LABELS, status);

/**
 * A status as a human reads it. An unknown one — a row written before a status
 * was renamed, or by something outside the app — is shown raw rather than
 * swallowed, so it stays visible instead of quietly reading as "Active".
 */
export const projectStatusLabel = (
  status: string | undefined | null,
  t: (en: string, sk: string, hu: string) => string,
): string => {
  const key = String(status ?? "").trim();
  if (!isProjectStatus(key)) return key;
  const [en, sk, hu] = PROJECT_STATUS_LABELS[key];
  return t(en, sk, hu);
};

/** Every status, in the order they are offered. */
export const projectStatusOrder = (): ProjectStatus[] =>
  Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];

/** The whole list as dropdown options, in PROJECT_STATUSES order. */
export const projectStatusOptions = (
  t: (en: string, sk: string, hu: string) => string,
): { value: ProjectStatus; label: string }[] =>
  projectStatusOrder().map((value) => ({ value, label: projectStatusLabel(value, t) }));

/** Badge colours. A status carries meaning, so it stays on the raw palette. */
export const projectStatusBadgeClass = (status: string | undefined | null): string => {
  switch (String(status ?? "").trim()) {
    case "new":
      return "bg-sky-50 text-sky-600 border-sky-100";
    case "active":
      return "bg-purple-50 text-purple-600 border-purple-100";
    case "completed":
      return "bg-emerald-50 text-emerald-600 border-emerald-100";
    case "on_hold":
      return "bg-amber-50 text-amber-600 border-amber-100";
    case "cancelled":
      return "bg-rose-50 text-rose-600 border-rose-100";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
};

/** The coloured dot that carries a status in a dropdown row or trigger. */
export const projectStatusDotClass = (status: string | undefined | null): string => {
  switch (String(status ?? "").trim()) {
    case "new":
      return "bg-sky-500";
    case "active":
      return "bg-purple-500";
    case "completed":
      return "bg-emerald-500";
    case "on_hold":
      return "bg-amber-500";
    case "cancelled":
      return "bg-rose-500";
    default:
      return "bg-slate-400";
  }
};

/*
  ── PROJECT PIPELINE ────────────────────────────────────

  The strip across the top of the project card, drawn the way the lead drawer
  draws the lead pipeline: every open status is a step of its own, and the
  statuses a project ends in share one closing segment at the end, lit in the
  colour of whichever one it actually ended in.
*/

/** The statuses a project ends in — folded into the strip's last segment. */
export const CLOSED_PROJECT_STATUSES: readonly string[] = ["completed", "cancelled"];

/** A step not yet reached. */
const PIPELINE_UNREACHED_CLASS = "bg-slate-300";

export interface ProjectPipelineSegment {
  key: string;
  title: string;
  tooltip: string;
  /** Reached — the current status or one before it. */
  filled: boolean;
  /** Background class: the status colour once reached, grey until then. */
  colorClass: string;
}

/**
 * The strip's segments for a project in `status`. A closed project has been
 * through every step, so all of them are lit. An unknown status reaches none —
 * it is shown raw by the select underneath, never guessed onto a step.
 */
export const projectPipelineSegments = (
  status: string | undefined | null,
  t: (en: string, sk: string, hu: string) => string,
): ProjectPipelineSegment[] => {
  const current = String(status ?? "").trim();
  const order = projectStatusOrder();
  const open = order.filter((s) => !CLOSED_PROJECT_STATUSES.includes(s));
  const closed = order.filter((s) => CLOSED_PROJECT_STATUSES.includes(s));
  const isClosed = closed.includes(current as ProjectStatus);
  const currentIndex = open.indexOf(current as ProjectStatus);
  const reached = t("(Current/Past)", "(Aktuálne/Minulé)", "(Aktuális/Múlt)");
  const upcoming = t("(Upcoming)", "(Nadchádzajúce)", "(Közelgő)");

  const segments: ProjectPipelineSegment[] = open.map((s, i) => {
    const filled = isClosed || (currentIndex !== -1 && i <= currentIndex);
    const title = projectStatusLabel(s, t);
    return {
      key: s,
      title,
      tooltip: `${title} ${filled ? reached : upcoming}`,
      filled,
      colorClass: filled ? projectStatusDotClass(s) : PIPELINE_UNREACHED_CLASS,
    };
  });

  const closedTitle = closed.map((s) => projectStatusLabel(s, t)).join(" / ");
  const closedWord = t("Closed", "Uzavreté", "Lezárva");
  segments.push({
    key: "closed",
    title: closedTitle,
    tooltip: `${closedWord} (${isClosed ? projectStatusLabel(current, t) : closedTitle})`,
    filled: isClosed,
    colorClass: isClosed ? projectStatusDotClass(current) : PIPELINE_UNREACHED_CLASS,
  });

  return segments;
};
