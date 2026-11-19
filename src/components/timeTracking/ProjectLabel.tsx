import { projectColor } from "../../utils/timeTracking.ts";

/**
 * Project dot + name in the project's own (darkened) colour, with the client after a "·" in muted
 * text. One drawing for List, Calendar, Timesheet and Reports. `compact` drops the client and
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
      <span className="truncate font-medium" style={{ color: `color-mix(in srgb, ${color} 72%, black)` }}>{name}</span>
      {!compact && client && <span className="truncate text-slate-400">· {client}</span>}
    </span>
  );
}
