import type { Task, TaskEmailReminder } from "../types";

/**
 * Task e-mail reminders ("Notify me by e-mail"). The server sends them — see
 * api/task_reminders.php — and this file mirrors its schedule so the drawer can
 * say exactly when the mail will arrive. Keep the two in step.
 */

export const TASK_EMAIL_REMINDERS: TaskEmailReminder[] = ["morning", "1h", "1d"];

/** Local time a "morning of the deadline" reminder goes out. */
export const TASK_REMINDER_MORNING = "08:00";

const isTime = (v: string | undefined): v is string => !!v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const parseLocal = (date: string, time: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [h, min] = time.split(":").map(Number);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min);
};

/** When the task itself is due: its deadline time, or the end of the day. */
export const taskDueAt = (task: Pick<Task, "deadline" | "deadlineTime">): Date | null =>
  parseLocal(task.deadline, isTime(task.deadlineTime) ? task.deadlineTime : "23:59");

/**
 * When the reminder is sent. A task without a time is due at the end of its
 * day, so "1 hour before" falls back to the morning; "1 day before" goes out
 * the previous day at the task's time, or in the morning when it has none.
 */
export const taskReminderSendAt = (
  task: Pick<Task, "deadline" | "deadlineTime">,
  when: TaskEmailReminder,
): Date | null => {
  const hasTime = isTime(task.deadlineTime);
  const due = taskDueAt(task);
  const morning = parseLocal(task.deadline, TASK_REMINDER_MORNING);
  if (!due || !morning) return null;
  const hourBefore = new Date(due.getTime());
  hourBefore.setHours(hourBefore.getHours() - 1);

  switch (when) {
    case "1h":
      return hasTime ? hourBefore : morning;
    case "1d": {
      const at = new Date((hasTime ? due : morning).getTime());
      at.setDate(at.getDate() - 1);
      return at;
    }
    case "morning":
      // A task due before the morning reminder would be late for it.
      return due <= morning ? hourBefore : morning;
    default:
      return null;
  }
};

/** The task's reminder map with `userName`'s choice set, or removed when `when` is null. */
export const withTaskReminder = (
  reminders: Task["emailReminders"],
  userName: string,
  when: TaskEmailReminder | null,
): Task["emailReminders"] => {
  const next = { ...(reminders || {}) };
  if (when) next[userName] = when;
  else delete next[userName];
  return Object.keys(next).length ? next : undefined;
};
