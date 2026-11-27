import React from "react";
import { History } from "lucide-react";
import type { Task } from "../types";
import type { Translate } from "../utils/taskLabels";
import { deadlinePostponement, quickDeadlines, type QuickDeadlineKey } from "../utils/taskDeadline";

const QUICK_LABEL: Record<QuickDeadlineKey, [string, string, string]> = {
  today: ["Today", "Dnes", "Ma"],
  tomorrow: ["Tomorrow", "Zajtra", "Holnap"],
  nextMonday: ["Next Monday", "Budúci pondelok", "Jövő hétfő"],
  plusWeek: ["+1 week", "+1 týždeň", "+1 hét"],
  plusMonth: ["+1 month", "+1 mesiac", "+1 hónap"],
};

/** "23 Jul 2026" for a YYYY-MM-DD string, in the system language's region. */
export const formatDeadlineDate = (dateStr: string, language: string): string => {
  const [y, m, d] = (dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const locale = language === "sk" ? "sk-SK" : language === "hu" ? "hu-HU" : "en-US";
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
};

/** One-click new dates, none earlier than the task's own floor. The current deadline's chip is lit. */
export const QuickDeadlineChips: React.FC<{
  value: string;
  min: string;
  onPick: (date: string) => void;
  t: Translate;
  disabled?: boolean;
}> = ({ value, min, onPick, t, disabled }) => (
  <div className="flex flex-wrap gap-1" data-testid="quick-deadline-chips">
    {quickDeadlines(min).map((q) => {
      const [en, sk, hu] = QUICK_LABEL[q.key];
      const active = value === q.date;
      return (
        <button
          key={q.key}
          type="button"
          disabled={disabled}
          aria-pressed={active}
          data-testid={`quick-deadline-${q.key}`}
          onClick={() => onPick(q.date)}
          className={`rounded-lg border px-2 py-0.5 text-micro font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
            active
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
          }`}
        >
          {t(en, sk, hu)}
        </button>
      );
    })}
  </div>
);

/**
 * "Postponed 2× · first due 12 Oct 2026". Renders nothing for a deadline that never moved. `compact`
 * is the list-row chip: just the count, with the whole story in the tooltip.
 */
export const DeadlinePostponedBadge: React.FC<{
  task: Pick<Task, "deadline" | "originalDeadline" | "deadlineMoves">;
  language: string;
  t: Translate;
  compact?: boolean;
  className?: string;
}> = ({ task, language, t, compact = false, className = "" }) => {
  const { moves, original } = deadlinePostponement(task);
  if (moves === 0) return null;
  const count = t(`Postponed ${moves}×`, `Posunuté ${moves}×`, `Elhalasztva ${moves}×`);
  const first = original
    ? t(`first due ${formatDeadlineDate(original, language)}`, `pôvodne do ${formatDeadlineDate(original, language)}`, `eredeti határidő: ${formatDeadlineDate(original, language)}`)
    : "";
  const title = first ? `${count} · ${first}` : count;
  return (
    <span
      data-testid="deadline-postponed"
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-micro font-bold text-amber-700 ${className}`}
    >
      <History className="h-2.5 w-2.5 shrink-0" />
      {compact ? `${moves}×` : <span>{first ? `${count} · ${first}` : count}</span>}
    </span>
  );
};
