import React from "react";
import type { ContactNameParts } from "../../utils/contactName";

/**
 * The contact person of a lead or client as two fields, first and last name (docs/NEWSLETTER.md C18).
 * Replaces the single "Contact person" input in every form that types one. The form keeps a
 * ContactNameParts in its state and, on save, merges contactNamePatch() (src/utils/contactName.ts)
 * into the record, which composes the full `contactPerson` and carries both parts.
 */
const LABELS = {
  en: { first: "First name", last: "Last name", greeting: "Name for greetings" },
  sk: { first: "Meno", last: "Priezvisko", greeting: "Meno na oslovenie" },
  hu: { first: "Keresztnév", last: "Vezetéknév", greeting: "Név a megszólításhoz" },
} as const;

interface ContactNameFieldsProps {
  /** The system language; anything but sk / hu reads as English. */
  lang?: string | null;
  value: ContactNameParts;
  onChange: (next: ContactNameParts) => void;
  /** Read-only look of a profile that is not being edited. */
  disabled?: boolean;
  /** Classes of each <input> and <label>: the form's own, so the fields look like their neighbours. */
  inputClassName?: string;
  labelClassName?: string;
  /** Wrapper classes; the two fields sit side by side by default. */
  className?: string;
  /**
   * A private person's own name (docs/NEWSLETTER.md B1.7): the two fields sit under a "Name for
   * greetings" heading, and `className` wraps the fields only.
   */
  forPerson?: boolean;
}

export const ContactNameFields: React.FC<ContactNameFieldsProps> = ({
  lang,
  value,
  onChange,
  disabled = false,
  inputClassName = "w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-blue-500 transition-all font-semibold",
  labelClassName = "type-overline text-slate-400 block",
  className = "grid grid-cols-2 gap-3",
  forPerson = false,
}) => {
  const copy = lang === "sk" ? LABELS.sk : lang === "hu" ? LABELS.hu : LABELS.en;
  const fields = (
    <div className={className}>
      <div className="space-y-1">
        <label className={labelClassName}>{copy.first}</label>
        <input
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value.firstName}
          onChange={(e) => onChange({ ...value, firstName: e.target.value })}
          className={inputClassName}
        />
      </div>
      <div className="space-y-1">
        <label className={labelClassName}>{copy.last}</label>
        <input
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value.lastName}
          onChange={(e) => onChange({ ...value, lastName: e.target.value })}
          className={inputClassName}
        />
      </div>
    </div>
  );
  if (!forPerson) return fields;
  return (
    <div className="space-y-1.5">
      <span className={`${labelClassName} font-bold`}>{copy.greeting}</span>
      {fields}
    </div>
  );
};
