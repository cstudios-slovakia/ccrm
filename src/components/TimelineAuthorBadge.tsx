import { UserRound } from "lucide-react";

interface TimelineAuthorBadgeProps {
  /** The user who produced the entry. Nothing renders when it is missing. */
  name?: string;
  /** Accent colour, normally the project manager colour of that user. */
  color?: string;
  className?: string;
}

/**
 * The "who did this" chip on a chronological timeline entry.
 *
 * Every entry a person produced — a logged note, a sent mail, a pipeline move —
 * carries the actor's name, so the history reads as "who did what, when"
 * instead of an anonymous list. Entries nobody in the CRM triggered (incoming
 * mail, imported paperwork) and events written before the field existed have no
 * author, and rendering nothing is deliberate: guessing the owner there would
 * put a name on work that person may never have done.
 */
export const TimelineAuthorBadge = ({
  name,
  color,
  className = "",
}: TimelineAuthorBadgeProps) => {
  const author = (name || "").trim();
  if (!author) return null;

  const accent = color || "#64748b";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border tracking-wider shadow-sm text-white whitespace-nowrap transition-transform duration-200 hover:scale-105 ${className}`}
      style={{ backgroundColor: accent, borderColor: accent }}
      title={author}
    >
      <UserRound className="h-2.5 w-2.5 stroke-[3]" />
      {author}
    </span>
  );
};

export default TimelineAuthorBadge;
