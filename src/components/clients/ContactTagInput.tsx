import React, { useId, useState } from "react";
import { X } from "lucide-react";
import { normalizeContactTags } from "../../utils/contactTags";

interface ContactTagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  listId?: string;
}

/** Pill-tag input using native <datalist> for existing contact-function autocomplete. */
export const ContactTagInput: React.FC<ContactTagInputProps> = ({
  value,
  onChange,
  suggestions,
  placeholder = "Add tag...",
  disabled = false,
  listId,
}) => {
  const [draft, setDraft] = useState("");
  const generatedId = useId();
  const datalistId = listId || generatedId;

  const commitDraft = (raw: string) => {
    const incoming = normalizeContactTags(raw);
    if (incoming.length === 0) {
      setDraft("");
      return;
    }
    const next = normalizeContactTags([...value, ...incoming]);
    onChange(next);
    setDraft("");
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const selectedKeys = new Set(value.map((t) => t.toLowerCase()));
  const availableSuggestions = suggestions.filter((s) => !selectedKeys.has(s.toLowerCase()));

  return (
    <div
      className={`min-h-10 w-full rounded-md border px-2 py-1.5 flex flex-wrap items-center gap-1.5 transition-all ${
        disabled
          ? "bg-gray-50 border-gray-200 cursor-default"
          : "bg-white border-gray-300 focus-within:border-entity-solid focus-within:ring-2 focus-within:ring-entity-ring"
      }`}
    >
      {value.map((tag, idx) => (
        <span
          key={`${tag.toLowerCase()}-${idx}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-micro font-semibold"
        >
          <span>{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="text-sky-600 hover:text-rose-600 cursor-pointer leading-none"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          type="text"
          list={datalistId}
          value={draft}
          onChange={(e) => {
            const val = e.target.value;
            if (val.includes(",")) {
              commitDraft(val);
            } else {
              setDraft(val);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft(draft);
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              removeTag(value.length - 1);
            }
          }}
          onBlur={() => {
            if (draft.trim()) commitDraft(draft);
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-24 bg-transparent text-ui font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none py-0.5"
        />
      )}
      {!disabled && availableSuggestions.length > 0 && (
        <datalist id={datalistId}>
          {availableSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
};
