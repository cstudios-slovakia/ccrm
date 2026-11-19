import type { CSSProperties } from "react";
import { projectColor } from "../../utils/timeTracking.ts";

/**
 * Project dot + name in the project's own (darkened) colour, with the client after a "·" in muted
 * text (darkened in light mode, lightened in dark mode). One drawing for List, Calendar, Timesheet and Reports. `compact` drops the client and
 * keeps it to one truncated line.
 */
export function ProjectLabel({
  projectId,
  name,
  client,
  compact = false,
  className = "",
}: {
  projectId: string | null | undefined;
  name: string;
  client?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const color = projectColor(projectId);
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`} title={client ? `${name} · ${client}` : name}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span
        className="truncate font-medium text-[color-mix(in_srgb,var(--project-color)_72%,black)] dark:text-[color-mix(in_srgb,var(--project-color)_55%,white)]"
        style={{ "--project-color": color } as CSSProperties}
      >
        {name}
      </span>
      {!compact && client && <span className="truncate text-slate-400">· {client}</span>}
    </span>
  );
}
