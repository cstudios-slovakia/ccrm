import { projectColor } from "../../utils/timeTracking.ts";

/**
 * Project dot + name in the project's own colour, with the client after a "·" in muted text.
 * One drawing for List, Calendar, Timesheet and Reports. `compact` drops the client and keeps it
 * to one truncated line.
 *
 * The name is the project colour darkened for white cards; in dark mode the theme's accent-lift
 * variables (the same ones `liftAccent` in utils/accentColor.ts uses) mix it towards white, so it
 * stays legible on a dark card. In light mode the lift amount is 0%.
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
  const text = `color-mix(in oklab, color-mix(in srgb, ${color} 72%, black), var(--accent-lift-color) var(--accent-lift-amount))`;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`} title={client ? `${name} · ${client}` : name}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate font-medium" style={{ color: text }}>
        {name}
      </span>
      {!compact && client && <span className="truncate text-gray-400">· {client}</span>}
    </span>
  );
}
