import React, { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { speakerColor } from "../../utils/focusPanel";

interface Props {
  speakerId: string;
  /** Current display name (a rename or "Participant N"). */
  name: string;
  /** Called with the typed text; empty means "reset to the default". */
  onRename: (speakerId: string, draft: string) => void;
  lang: "en" | "sk" | "hu";
  className?: string;
}

/**
 * A speaker as a coloured pill. Clicking it opens a small inline input to rename: Enter saves,
 * Esc cancels, an empty name resets to the default. The rename applies everywhere at once because
 * the panel keeps one `speakerNames` map.
 */
export const SpeakerChip: React.FC<Props> = ({ speakerId, name, onRename, lang, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelled = useRef(false);
  const color = speakerColor(speakerId);

  const rename = lang === "sk" ? "Premenovať" : lang === "hu" ? "Átnevezés" : "Rename";
  const label = `${rename} ${name}`;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    if (cancelled.current) return;
    setEditing(false);
    onRename(speakerId, draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={40}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            // Unmounting the input can fire blur; the flag keeps that from saving the draft.
            cancelled.current = true;
            setDraft(name);
            setEditing(false);
          }
        }}
        className={cn(
          "inline-block w-28 align-baseline px-2 h-5 rounded-full border text-caption font-semibold outline-none focus:ring-2 focus:ring-indigo-300 bg-white",
          color.chip.split(" ").filter((c) => !c.startsWith("hover:") && !c.startsWith("bg-")).join(" "),
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        cancelled.current = false;
        setEditing(true);
      }}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 align-baseline px-2 h-5 mr-1.5 rounded-full border text-caption font-semibold cursor-pointer select-none max-w-48 transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none motion-reduce:active:scale-100",
        color.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", color.dot)} />
      <span className="truncate">{name}</span>
    </button>
  );
};
