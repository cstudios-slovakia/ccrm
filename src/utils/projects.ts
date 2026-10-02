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

/**
 * The project's deadline state, or null when there is nothing to say — the type
 * is not time-boxed, no date is set, or the date is unreadable. Callers render
 * nothing at all on null rather than an empty badge.
 */
export const evaluateProjectDeadline = (
  project: Pick<Project, "deadline" | "status" | "finishedAt"> | undefined | null,
  projectType: Pick<ProjectType, "hasDeadline" | "deadlineWarningDays"> | undefined | null,
  today: string,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
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
  const closed = isClosedProjectStatus(project?.status, statuses);
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
 * The real finish date after a status change. Moving into a completed status
 * without a finish date stamps `today`; an existing date (set by hand) is kept.
 * Moving it back to an open status clears the date, because a finish date on a
 * project still in progress would keep showing it as finished in every list.
 * A cancelled status leaves the date as it was. Asked by group, not key, so a
 * status added in settings behaves like the built-in it is grouped with.
 */
export const finishedAtForStatus = (
  nextStatus: string,
  finishedAt: string | null | undefined,
  today: string,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): string => {
  const current = toDateOnly(finishedAt);
  const group = projectStatusGroup(nextStatus, statuses);
  if (group === "completed") return current || toDateOnly(today);
  if (group === "cancelled") return current;
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

  The statuses are configured per installation (Settings → Project settings →
  Project statuses), the same way the lead pipeline stages are. Each carries:

  - `key`   — what a project stores in `status`. Given once and never changed,
              so renaming a status rewrites no project, no saved filter and no
              workflow that points at it.
  - `label` — what it is called. Empty on the five built-ins until someone
              renames one, so those keep speaking all three UI languages.
  - `color` — a hex colour, painted the way the lead stages are.
  - `group` — what it means: `new` (where a project starts), `in_progress`,
              `completed` (closed and done — stamps the finish date) or
              `cancelled` (closed and abandoned). Deadlines, the pipeline strip,
              the "active projects" counts and the finish date all ask the
              group, never the key, so an added status behaves like the
              built-in it is grouped with.

  Every helper takes the list as its last argument and falls back to the
  built-ins, so a caller with no settings in reach still gets the stock five.
  Components read the live list with useProjectStatuses().

  The same list is mirrored by ccrm_project_status_defs() in api/auth.php,
  which validates what automations and the API may write.
*/

export type ProjectStatusGroup = "new" | "in_progress" | "completed" | "cancelled";

/** The groups in pipeline order — also the order the statuses are kept in. */
export const PROJECT_STATUS_GROUPS: readonly ProjectStatusGroup[] = ["new", "in_progress", "completed", "cancelled"];

export interface ProjectStatusDef {
  key: string;
  /** Empty while a built-in has not been renamed — it is then translated. */
  label?: string;
  color: string;
  group: ProjectStatusGroup;
}

/** en / sk / hu names of the built-in statuses, in the shape every view's `t()` takes. */
const BUILTIN_PROJECT_STATUS_LABELS: Record<string, [string, string, string]> = {
  new: ["New", "Nový", "Új"],
  active: ["Active", "Aktívny", "Aktív"],
  on_hold: ["On Hold", "Pozastavený", "Függőben"],
  completed: ["Completed", "Dokončený", "Befejezett"],
  cancelled: ["Cancelled", "Zrušený", "Törölt"],
};

/** What an installation that never touched the editor has. */
export const DEFAULT_PROJECT_STATUS_DEFS: readonly ProjectStatusDef[] = [
  { key: "new", color: "#0ea5e9", group: "new" },
  { key: "active", color: "#a855f7", group: "in_progress" },
  { key: "on_hold", color: "#f59e0b", group: "in_progress" },
  { key: "completed", color: "#10b981", group: "completed" },
  { key: "cancelled", color: "#f43f5e", group: "cancelled" },
];

/** What a status added in settings starts with. */
export const NEW_PROJECT_STATUS_COLOR = "#6366f1";
/** An unknown status — written by something outside the app, or since deleted. */
const UNKNOWN_STATUS_COLOR = "#94a3b8";
/** A pipeline step not yet reached. */
const PIPELINE_UNREACHED_CLASS = "bg-slate-300";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_KEY_LENGTH = 50;

const isGroup = (value: unknown): value is ProjectStatusGroup =>
  typeof value === "string" && (PROJECT_STATUS_GROUPS as readonly string[]).includes(value);

/**
 * A stored list, cleaned up: unique non-empty keys, a known group, a hex
 * colour, and kept in group order. Anything unreadable — nothing stored yet, a
 * malformed blob, a list emptied by hand — falls back to the built-ins, so
 * there is always somewhere for a project to start.
 */
export const normalizeProjectStatusDefs = (raw: unknown): ProjectStatusDef[] => {
  const defaults = () => DEFAULT_PROJECT_STATUS_DEFS.map((d) => ({ ...d }));
  if (!Array.isArray(raw)) return defaults();
  const seen = new Set<string>();
  const out: ProjectStatusDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = String(rec.key ?? "").trim();
    if (!key || key.length > MAX_KEY_LENGTH || seen.has(key)) continue;
    seen.add(key);
    const builtin = DEFAULT_PROJECT_STATUS_DEFS.find((d) => d.key === key);
    const color = HEX_COLOR.test(String(rec.color ?? ""))
      ? String(rec.color).toLowerCase()
      : builtin?.color ?? NEW_PROJECT_STATUS_COLOR;
    const group = isGroup(rec.group) ? rec.group : builtin?.group ?? "in_progress";
    const label = String(rec.label ?? "").trim();
    out.push(label ? { key, label, color, group } : { key, color, group });
  }
  // A list with nowhere to start is no list at all.
  if (!out.some((d) => d.group === "new" || d.group === "in_progress")) return defaults();
  return PROJECT_STATUS_GROUPS.flatMap((g) => out.filter((d) => d.group === g));
};

/**
 * A key for a status added under `name`: the name folded to ASCII snake case,
 * made unique against `taken`. Only ever computed once — see `key` above.
 */
export const projectStatusKeyFor = (name: string, taken: readonly string[]): string => {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, MAX_KEY_LENGTH - 4) || "status";
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
};

const findStatus = (
  status: string | undefined | null,
  statuses: readonly ProjectStatusDef[],
): ProjectStatusDef | undefined => {
  const key = String(status ?? "").trim();
  return key ? statuses.find((d) => d.key === key) : undefined;
};

/**
 * A status as a human reads it: the name given in settings, else the built-in
 * translation. An unknown one — a status since deleted, or a row written by
 * something outside the app — is shown raw rather than swallowed, so it stays
 * visible instead of quietly reading as "Active".
 */
export const projectStatusLabel = (
  status: string | undefined | null,
  t: (en: string, sk: string, hu: string) => string,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): string => {
  const key = String(status ?? "").trim();
  const def = findStatus(key, statuses);
  if (def?.label) return def.label;
  const builtin = BUILTIN_PROJECT_STATUS_LABELS[key];
  return builtin ? t(builtin[0], builtin[1], builtin[2]) : key;
};

/** Every status key, in the order they are offered. */
export const projectStatusOrder = (
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): ProjectStatus[] => statuses.map((d) => d.key);

/** The whole list as dropdown options, in order. */
export const projectStatusOptions = (
  t: (en: string, sk: string, hu: string) => string,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): { value: ProjectStatus; label: string }[] =>
  statuses.map((d) => ({ value: d.key, label: projectStatusLabel(d.key, t, statuses) }));

/** What a status means, or null for one the list does not know. */
export const projectStatusGroup = (
  status: string | undefined | null,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): ProjectStatusGroup | null => findStatus(status, statuses)?.group ?? null;

/** True for a status a project ends in — completed or cancelled. */
export const isClosedProjectStatus = (
  status: string | undefined | null,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): boolean => {
  const group = projectStatusGroup(status, statuses);
  return group === "completed" || group === "cancelled";
};

/** The statuses a project is still being worked in, in order. */
export const openProjectStatuses = (
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): ProjectStatus[] => statuses.filter((d) => d.group === "new" || d.group === "in_progress").map((d) => d.key);

/**
 * Where every project starts: the first status of the "new" group, else the
 * first open one. Nothing promotes it out of there on its own — which lead
 * status moves a project along differs between installations, so that lives
 * in a workflow.
 */
export const defaultProjectStatus = (
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): ProjectStatus =>
  statuses.find((d) => d.group === "new")?.key ?? openProjectStatuses(statuses)[0] ?? statuses[0]?.key ?? "new";

/** The status's hex colour; grey for one the list does not know. */
export const projectStatusColor = (
  status: string | undefined | null,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): string => findStatus(status, statuses)?.color ?? UNKNOWN_STATUS_COLOR;

/**
 * Badge colours, tinted from the status colour the way the lead stage badges
 * are. Pair with `border` and a padding/rounding of the caller's choosing.
 */
export const projectStatusBadgeStyle = (
  status: string | undefined | null,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): { backgroundColor: string; color: string; borderColor: string } => {
  const color = projectStatusColor(status, statuses);
  return { backgroundColor: `${color}14`, color, borderColor: `${color}40` };
};

/** The coloured dot that carries a status in a dropdown row or trigger. */
export const projectStatusDotStyle = (
  status: string | undefined | null,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): { backgroundColor: string } => ({ backgroundColor: projectStatusColor(status, statuses) });

/*
  ── PROJECT PIPELINE ────────────────────────────────────

  The strip across the top of the project card, drawn the way the lead drawer
  draws the lead pipeline: every open status is a step of its own, and the
  statuses a project ends in share one closing segment at the end, lit in the
  colour of whichever one it actually ended in.
*/

export interface ProjectPipelineSegment {
  key: string;
  title: string;
  tooltip: string;
  /** Reached — the current status or one before it. */
  filled: boolean;
  /** Background class for a step not reached; "" once it is lit in `color`. */
  colorClass: string;
  /** The status colour of a reached step. */
  color?: string;
}

/**
 * The strip's segments for a project in `status`. A closed project has been
 * through every step, so all of them are lit. An unknown status reaches none —
 * it is shown raw by the select underneath, never guessed onto a step.
 */
export const projectPipelineSegments = (
  status: string | undefined | null,
  t: (en: string, sk: string, hu: string) => string,
  statuses: readonly ProjectStatusDef[] = DEFAULT_PROJECT_STATUS_DEFS,
): ProjectPipelineSegment[] => {
  const current = String(status ?? "").trim();
  const open = openProjectStatuses(statuses);
  const closed = statuses.filter((d) => d.group === "completed" || d.group === "cancelled").map((d) => d.key);
  const isClosed = closed.includes(current);
  const currentIndex = open.indexOf(current);
  const reached = t("(Current/Past)", "(Aktuálne/Minulé)", "(Aktuális/Múlt)");
  const upcoming = t("(Upcoming)", "(Nadchádzajúce)", "(Közelgő)");
  const label = (s: string) => projectStatusLabel(s, t, statuses);
  const paint = (s: string, filled: boolean) =>
    filled
      ? { colorClass: "", color: projectStatusColor(s, statuses) }
      : { colorClass: PIPELINE_UNREACHED_CLASS };

  const segments: ProjectPipelineSegment[] = open.map((s, i) => {
    const filled = isClosed || (currentIndex !== -1 && i <= currentIndex);
    const title = label(s);
    return { key: s, title, tooltip: `${title} ${filled ? reached : upcoming}`, filled, ...paint(s, filled) };
  });

  if (closed.length > 0) {
    const closedTitle = closed.map(label).join(" / ");
    const closedWord = t("Closed", "Uzavreté", "Lezárva");
    segments.push({
      key: "closed",
      title: closedTitle,
      tooltip: `${closedWord} (${isClosed ? label(current) : closedTitle})`,
      filled: isClosed,
      ...paint(current, isClosed),
    });
  }

  return segments;
};
