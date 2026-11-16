import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { Language } from "../utils/translations";
import {
  fetchMicrosoftMailStatus,
  signInWithMicrosoft,
  type MicrosoftMailStatus,
  type MicrosoftMailTarget,
} from "../utils/microsoftMail";

/*
  ── SIGN IN WITH MICROSOFT ──────────────────────────────

  The one control that connects a Microsoft 365 (Exchange Online) mailbox: no host, no
  password. Used for the user's own mailbox (Personal settings → E-mail) and for a company
  mailbox (Settings → E-mail). It asks the server whether the app is registered and whether
  the mailbox is signed in, and says which of the three things is missing.
*/

interface MicrosoftMailConnectProps {
  language: Language;
  target: MicrosoftMailTarget;
  /** Called when a sign-in finished and the server holds the tokens. */
  onSignedIn: (account: string) => void;
  /** Label of the button when the mailbox is already signed in (a second sign-in replaces the first). */
  again?: boolean;
  className?: string;
}

const MicrosoftLogo: React.FC = () => (
  <svg viewBox="0 0 21 21" className="h-4 w-4 shrink-0" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export const MicrosoftMailConnect: React.FC<MicrosoftMailConnectProps> = ({ language, target, onSignedIn, again = false, className }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const [status, setStatus] = useState<MicrosoftMailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetKey = target.kind === "company" ? target.mailboxId : "";

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await fetchMicrosoftMailStatus(target));
    } catch {
      // An older backend or a dropped request: the button still works and reports its own error.
      setStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, targetKey]);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    const result = await signInWithMicrosoft(target);
    setBusy(false);
    if (result.ok) {
      onSignedIn(result.account ?? "");
      void loadStatus();
      return;
    }
    if (!result.cancelled) {
      setError(result.error || t("The sign-in did not finish.", "Prihlásenie sa nedokončilo.", "A bejelentkezés nem fejeződött be."));
    }
  };

  // Only a clear "no": an answer without the flag (an older backend) leaves the button on.
  const notConfigured = status?.configured === false;

  return (
    <div className={className ?? "space-y-3"} data-testid="microsoft-mail-connect">
      {notConfigured && (
        <div role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-caption font-semibold flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {t(
              "Microsoft 365 sign-in is not set up yet. An administrator has to enter the Microsoft app registration in Settings → E-mail first.",
              "Prihlásenie cez Microsoft 365 ešte nie je nastavené. Administrátor musí najprv zadať registráciu aplikácie Microsoft v Nastavenia → E-mail.",
              "A Microsoft 365 bejelentkezés még nincs beállítva. Egy rendszergazdának előbb meg kell adnia a Microsoft alkalmazásregisztrációt a Beállítások → E-mail részben.",
            )}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy || notConfigured}
        data-testid="microsoft-sign-in"
        className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-ui font-semibold text-slate-800 shadow-sm hover:border-slate-500 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MicrosoftLogo />}
        {busy
          ? t("Waiting for the Microsoft sign-in…", "Čaká sa na prihlásenie cez Microsoft…", "Várakozás a Microsoft-bejelentkezésre…")
          : again
            ? t("Sign in with Microsoft again", "Prihlásiť sa cez Microsoft znova", "Bejelentkezés újra Microsofttal")
            : t("Sign in with Microsoft", "Prihlásiť sa cez Microsoft", "Bejelentkezés Microsofttal")}
      </button>
      {error && (
        <div role="alert" data-testid="microsoft-sign-in-error" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-caption font-semibold flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
    </div>
  );
};
