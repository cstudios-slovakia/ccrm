import React from "react";
import { Eye, EyeOff, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { SECRET_MASK, isSecretMask } from "../../utils/aiConfig";
import type { Language } from "../../utils/translations";

/**
 * Input for a write-only secret (API keys, mailbox passwords, OAuth secrets).
 *
 * The server never sends these values back — the sync GET substitutes
 * CCRM_SECRET_MASK, and posting the mask back means "leave the stored value
 * alone" (see ccrm_mask_secrets / ccrm_merge_secrets in api/auth.php). Rendering
 * that mask in a plain password box produced the bug this component exists to
 * fix: the field showed eight dots, and pressing "reveal" showed eight
 * asterisks, so the saved key looked corrupted and there was no way to tell
 * "a key is stored" from "someone typed asterisks".
 *
 * Here the mask is never rendered as text. It becomes an explicit "saved" state:
 * an empty field that says what will happen if you leave it alone, a badge, and
 * a delete action. The moment the user types, `value` stops being the mask and
 * the field behaves like an ordinary password input with a reveal toggle.
 */
interface SecretInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Placeholder for a real (non-mask) value, e.g. "sk-proj-…". */
  placeholder?: string;
  disabled?: boolean;
  language: Language;
  /** Extra classes for the wrapper (width constraints live here). */
  className?: string;
  /** Extra classes for the <input> itself, so callers keep their field styling. */
  inputClassName?: string;
  /** Monospace rendering suits keys; passwords look better in the body font. */
  mono?: boolean;
  autoComplete?: string;
  /**
   * Enforce a value on submit. Ignored while the stored secret is untouched:
   * the box is deliberately empty then, and a plain `required` would block the
   * form for a field the user has no reason to retype.
   */
  required?: boolean;
}

const t = (lang: Language, en: string, sk: string, hu: string): string =>
  lang === "sk" ? sk : lang === "hu" ? hu : en;

export const SecretInput: React.FC<SecretInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  language,
  className = "",
  inputClassName = "",
  mono = true,
  autoComplete = "off",
  required = false,
}) => {
  const [revealed, setRevealed] = React.useState(false);
  // Remembers that a secret is stored server-side even after the user clears the
  // box, which is what lets us warn that saving now DELETES it — and offer to
  // put the mask back instead of making them reload the page to undo.
  const [hadStoredSecret, setHadStoredSecret] = React.useState(() => isSecretMask(value));

  React.useEffect(() => {
    if (isSecretMask(value)) setHadStoredSecret(true);
  }, [value]);

  const isStored = isSecretMask(value);
  // Cleared a previously stored secret: the save will wipe it server-side.
  const willClearStored = hadStoredSecret && !isStored && value === "";

  const baseInputClass =
    "w-full pl-4 pr-11 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200 " +
    "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 " +
    "disabled:bg-slate-50 disabled:text-slate-400 " +
    (mono ? "font-mono " : "");

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative">
        <input
          type={isStored || revealed ? "text" : "password"}
          disabled={disabled}
          required={required && !isStored}
          autoComplete={autoComplete}
          // The mask is a server placeholder, not a value — never render it.
          value={isStored ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isStored
              ? t(
                  language,
                  "Saved — type a new value to replace it",
                  "Uložené — novú hodnotu zadáte prepísaním",
                  "Mentve — új érték megadásával írhatja felül"
                )
              : placeholder
          }
          className={`${baseInputClass} ${
            isStored
              ? "bg-emerald-50/50 border-emerald-200 text-slate-700 placeholder:text-emerald-700/70 placeholder:font-bold placeholder:normal-case"
              : willClearStored
                ? "bg-amber-50/50 border-amber-300 text-slate-800"
                : "bg-white border-slate-200 text-slate-700"
          } ${inputClassName}`}
        />

        {isStored ? (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-emerald-600 pointer-events-none"
            title={t(language, "A value is stored on the server", "Hodnota je uložená na serveri", "Az érték a szerveren van tárolva")}
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            disabled={disabled || value === ""}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 hover:scale-110 active:scale-95 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            title={
              revealed
                ? t(language, "Hide", "Skryť", "Elrejtés")
                : t(language, "Show", "Zobraziť", "Megjelenítés")
            }
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {isStored && !disabled && (
        <div className="flex items-center justify-between gap-3 animate-fade-in">
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">
            {t(language, "Saved & encrypted", "Uložené a zašifrované", "Mentve és titkosítva")}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 transition-colors duration-150 cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
            {t(language, "Remove", "Odstrániť", "Eltávolítás")}
          </button>
        </div>
      )}

      {willClearStored && !disabled && (
        <div className="flex items-center justify-between gap-3 animate-fade-in">
          <span className="text-[9px] font-black uppercase tracking-wider text-amber-700">
            {t(
              language,
              "Saving now deletes the stored value",
              "Uložením sa uložená hodnota vymaže",
              "A mentés törli a tárolt értéket"
            )}
          </span>
          <button
            type="button"
            onClick={() => onChange(SECRET_MASK)}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors duration-150 cursor-pointer"
          >
            <Undo2 className="h-3 w-3" />
            {t(language, "Keep it", "Ponechať", "Megtartás")}
          </button>
        </div>
      )}
    </div>
  );
};

export default SecretInput;
