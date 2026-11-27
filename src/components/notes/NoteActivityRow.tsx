import { NotebookPen } from "lucide-react";
import type { Language } from "../../utils/translations";
import { formatTimestampLocalized } from "../../utils/localTime";

/**
 * The read-only trace a note leaves on a lead's or project's timeline ("Note added" + a snippet).
 * Notes are managed in their own Notes card/tab; this row only records that something happened.
 */
export const NoteActivityRow = ({
  title,
  content,
  timestamp,
  author,
  language,
}: {
  title: string;
  content?: string | null;
  timestamp: string;
  author?: string | null;
  language: Language;
}) => (
  <div className="flex items-start gap-3 rounded-lg border border-yellow-200/70 bg-yellow-50/50 px-3.5 py-2.5 text-left animate-fade-in">
    <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700/70" aria-hidden />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-ui font-semibold text-gray-800">{title}</span>
        <span className="text-micro font-medium text-slate-400">
          {author ? `${author} · ` : ""}
          {formatTimestampLocalized(timestamp, language)}
        </span>
      </div>
      {content && <p className="mt-0.5 truncate text-caption font-medium text-gray-500">{content}</p>}
    </div>
  </div>
);
