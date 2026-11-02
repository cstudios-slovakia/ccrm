import React from "react";
import { Repeat } from "lucide-react";
import type { RecurringTaskTemplate, Task } from "../types";
import type { Translate } from "../utils/taskLabels";
import { describeRecurrenceWithEnd } from "../utils/recurringTasks";

interface TaskRecurringMarkProps {
  task: Pick<Task, "recurringSourceId">;
  /** The loaded series; the tooltip names the rule when the task's series is among them. */
  templates?: RecurringTaskTemplate[];
  language: "en" | "sk" | "hu";
  t: Translate;
  className?: string;
}

/**
 * The "Recurring" chip on a task card or row: a Repeat icon and label whose
 * tooltip spells out the series' rule ("Každý týždeň v pondelok, bez konca").
 * Renders nothing for a task that is not part of a series.
 */
export const TaskRecurringMark: React.FC<TaskRecurringMarkProps> = ({ task, templates, language, t, className = "" }) => {
  if (!task.recurringSourceId) return null;
  const template = templates?.find((tpl) => tpl.id === task.recurringSourceId);
  const title = template?.recurrence
    ? `${t("Recurring", "Opakovaná", "Ismétlődő")}: ${describeRecurrenceWithEnd(template.recurrence, language)}`
    : t("Part of a recurring series", "Súčasť opakovanej série", "Egy ismétlődő sorozat része");
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100 text-micro shrink-0 ${className}`}
    >
      <Repeat className="h-2.5 w-2.5 text-indigo-600" aria-hidden="true" />
      <span>{t("Recurring", "Opakované", "Ismétlődő")}</span>
    </span>
  );
};
