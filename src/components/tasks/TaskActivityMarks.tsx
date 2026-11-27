import React from "react";
import { MessageSquare } from "lucide-react";
import type { Task } from "../../types";
import { normalizeReactionRecord } from "../../utils/taskActivityFormat";

interface TaskActivityMarksProps {
  task: Pick<Task, "commentCount" | "reactions">;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export const TaskActivityMarks: React.FC<TaskActivityMarksProps> = ({
  task,
  onClick,
  title,
}) => {
  const commentCount = Number(task.commentCount ?? 0);
  const reactions = Object.entries(normalizeReactionRecord(task.reactions)).sort(
    (a, b) => b[1].length - a[1].length
  );

  if (commentCount <= 0 && reactions.length === 0) {
    return null;
  }

  const topReactions = reactions.slice(0, 3);
  const extraCount = reactions.length - topReactions.length;
  const interactive = Boolean(onClick);

  const Tag = interactive ? "button" : "span";
  const baseClass =
    "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/90 px-1.5 py-0.5 text-micro font-semibold text-slate-600 tabular-nums transition-colors shrink-0";

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {commentCount > 0 && (
        <Tag
          {...(interactive
            ? {
                type: "button" as const,
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onClick?.(e);
                },
              }
            : {})}
          data-testid="task-comment-count-badge"
          title={title}
          className={`${baseClass} ${
            interactive ? "cursor-pointer hover:bg-entity-subtle hover:border-entity-border hover:text-entity-text" : ""
          }`}
        >
          <MessageSquare className="h-2.5 w-2.5 shrink-0" />
          <span>{commentCount}</span>
        </Tag>
      )}
      {topReactions.map(([emoji, users]) => (
        <Tag
          key={emoji}
          {...(interactive
            ? {
                type: "button" as const,
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onClick?.(e);
                },
              }
            : {})}
          data-testid="task-reaction-badge"
          title={users.join(", ")}
          className={`${baseClass} ${
            interactive ? "cursor-pointer hover:bg-entity-subtle hover:border-entity-border" : ""
          }`}
        >
          <span>{emoji}</span>
          <span>{users.length}</span>
        </Tag>
      ))}
      {extraCount > 0 && (
        <span className="text-micro font-semibold text-slate-400">+{extraCount}</span>
      )}
    </span>
  );
};
