import { useState } from "react";
import { Eye, Minus } from "lucide-react";
import { getStoredLanguage } from "../utils/translations";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Extra classes for the wrapping <div> (which is always position: relative). */
  wrapperClassName?: string;
}

/**
 * Password field with a built-in show/hide toggle.
 *
 * Drop-in replacement for `<input type="password" .../>`. All standard input
 * props are forwarded. Make sure the input's className leaves right padding
 * (e.g. `pr-10`) so the eye button doesn't overlap the text.
 */
const label = (en: string, sk: string, hu: string): string => {
  const lang = getStoredLanguage();
  return lang === "sk" ? sk : lang === "hu" ? hu : en;
};

export function PasswordInput({ className = "", wrapperClassName = "", ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className={`relative ${wrapperClassName}`.trim()}>
      <input {...props} type={show ? "text" : "password"} className={className} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? label("Hide password", "Skryť heslo", "Jelszó elrejtése") : label("Show password", "Zobraziť heslo", "Jelszó megjelenítése")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer p-1 transition-colors active:scale-90"
      >
        {show ? <Minus className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
