// Deadline rules for tasks, in one place.
//
// 1. A deadline can never lie before the day the task was created. A new task is
//    created today, so today is its floor; a stored task's floor is its creation day.
// 2. Every time a deadline is pushed to a LATER date it is counted, and the date the
//    task was first given is remembered. The server keeps these two numbers (the
//    tasks upsert in sync.php, the same comparison as `deadlineChange` below); the
//    client mirrors the rule so the badge is right before the next sync arrives.

import type { Task } from "../types";

const pad = (n: number): string => String(n).padStart(2, "0");

/** A Date as YYYY-MM-DD in local time. */
export const toDateStr = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayStr = (now: Date = new Date()): string => toDateStr(now);

const addDays = (from: string, days: number): string => {
  const [y, m, d] = from.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
};

/** The day a task was created (YYYY-MM-DD), or "" when it has no creation stamp (legacy rows). */
export const taskCreatedDate = (task: Pick<Task, "createdAt"> | null | undefined): string => {
  const m = String(task?.createdAt ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
};

/**
 * The earliest deadline a task may carry: its creation day, or today for a task that does not
 * exist yet. "" means no floor (a stored task with no creation stamp).
 */
export const minDeadlineFor = (task?: Pick<Task, "createdAt"> | null, now: Date = new Date()): string =>
  task ? taskCreatedDate(task) : todayStr(now);

/** `value` raised to the floor; an empty value stays empty so a cleared field is not filled in. */
export const clampDeadline = (value: string, min: string): string => (value && min && value < min ? min : value);

/** The task's deadline history as the badge reads it. */
export interface DeadlinePostponement {
  /** How many times the deadline was pushed to a later date. */
  moves: number;
  /** The deadline the task was first given — only meaningful once it has moved. */
  original: string;
}

export const deadlinePostponement = (
  task: Pick<Task, "deadline" | "originalDeadline" | "deadlineMoves">,
): DeadlinePostponement => {
  const moves = Math.max(0, Math.floor(Number(task.deadlineMoves) || 0));
  return { moves, original: task.originalDeadline || (moves > 0 ? "" : task.deadline) };
};

/**
 * The fields to write when a task's deadline becomes `next`. Moving it later counts one
 * postponement and pins the original date; moving it earlier, or leaving it, changes nothing.
 * Same comparison as the sync upsert, so a mirrored result and the server's agree.
 */
export const deadlineChange = (
  task: Pick<Task, "deadline" | "originalDeadline" | "deadlineMoves">,
  next: string,
): Pick<Task, "deadline" | "originalDeadline" | "deadlineMoves"> => {
  const moves = Math.max(0, Math.floor(Number(task.deadlineMoves) || 0));
  if (next && task.deadline && next > task.deadline) {
    return { deadline: next, originalDeadline: task.originalDeadline || task.deadline, deadlineMoves: moves + 1 };
  }
  return { deadline: next, originalDeadline: task.originalDeadline ?? null, deadlineMoves: moves };
};

export type QuickDeadlineKey = "today" | "tomorrow" | "nextMonday" | "plusWeek" | "plusMonth";

export interface QuickDeadline {
  key: QuickDeadlineKey;
  date: string;
}

/** The one-click dates offered next to a deadline field, none of them earlier than `min`. */
export const quickDeadlines = (min: string, now: Date = new Date()): QuickDeadline[] => {
  const today = todayStr(now);
  const dow = now.getDay(); // 0 = Sunday
  const untilMonday = ((8 - dow) % 7) || 7;
  const [y, m, d] = today.split("-").map(Number);
  const all: QuickDeadline[] = [
    { key: "today", date: today },
    { key: "tomorrow", date: addDays(today, 1) },
    { key: "nextMonday", date: addDays(today, untilMonday) },
    { key: "plusWeek", date: addDays(today, 7) },
    { key: "plusMonth", date: toDateStr(new Date(y, m, d)) },
  ];
  const seen = new Set<string>();
  return all.filter((q) => {
    if (min && q.date < min) return false;
    // "Next Monday" is tomorrow on a Sunday, and so on: do not offer the same day twice.
    if (seen.has(q.date)) return false;
    seen.add(q.date);
    return true;
  });
};
