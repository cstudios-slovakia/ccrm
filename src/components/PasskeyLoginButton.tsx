import React, { useEffect, useState } from "react";
import { Fingerprint, Loader2, AlertCircle } from "lucide-react";
import type { Language } from "../utils/translations";
import type { UserProfile } from "../types";
import { isPasskeySupported, passkeyErrorKind, type LoginMethod } from "../utils/passkeys";
import {
  isPasskeyOnThisDevice,
  fetchPasskeyStatus,
  getLoginOptions,
  platformAuthenticatorAvailable,
  verifyLoginAssertion,
} from "../utils/passkeyCeremony";

export interface PasskeyLoginButtonProps {
  systemLanguage: Language;
  rememberMe: boolean;
  onLoginSuccess: (user: UserProfile, method: LoginMethod) => void;
  disabled?: boolean;
  /**
   * Called before the modal ceremony: the screen aborts its pending autofill
   * (conditional) request, because the server keeps a single challenge per session.
   */
  onBeforeModal?: () => Promise<void>;
  /** Called when the modal ceremony ended without signing in, so autofill can resume. */
  onAfterModal?: () => void;
}

export const PasskeyLoginButton: React.FC<PasskeyLoginButtonProps> = ({
  systemLanguage,
  rememberMe,
  onLoginSuccess,
  disabled = false,
  onBeforeModal,
  onAfterModal,
}) => {
  // Without a passkey made or used on this device the button would only open an empty
  // OS prompt. A synced passkey on a fresh browser still signs in through email autofill.
  const [available, setAvailable] = useState<boolean | null>(() =>
    isPasskeySupported() && isPasskeyOnThisDevice() ? null : false
  );
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tr = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  useEffect(() => {
    if (!isPasskeySupported() || !isPasskeyOnThisDevice()) {
      return;
    }

    let isMounted = true;
    fetchPasskeyStatus().then((ok) => {
      if (isMounted) setAvailable(ok);
    });
    platformAuthenticatorAvailable().then((ok) => {
      if (isMounted) setPlatformAvailable(ok);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (available !== true) {
    return null;
  }

  const failedMessage = () =>
    tr(
      "Passkey sign-in failed. Try again or use your email and password.",
      "Prihlásenie prístupovým kľúčom zlyhalo. Skúste znova alebo použite e-mail a heslo.",
      "A hozzáférési kulcsos bejelentkezés sikertelen. Próbálja újra, vagy használja az e-mailt és a jelszót."
    );

  const handlePasskeyLogin = async () => {
    if (disabled || isLoading) return;

    setError(null);
    setIsLoading(true);
    let signedIn = false;

    try {
      // The pending autofill request owns the session's only challenge; retire it first.
      await onBeforeModal?.();

      // 1. Fetch login options
      const opts = await getLoginOptions();
      if (!opts.ok) {
        if (opts.throttled) {
          setError(
            tr(
              "Too many login attempts. Please wait a few minutes and try again.",
              "Príliš veľa pokusov o prihlásenie. Počkajte niekoľko minút a skúste to znova.",
              "Túl sok bejelentkezési kísérlet. Kérjük, várjon néhány percet, és próbálja újra."
            )
          );
          return;
        }
        setError(opts.message ?? failedMessage());
        return;
      }

      // 2. Browser biometric prompt
      let cred: Credential | null = null;
      try {
        cred = await navigator.credentials.get({ publicKey: opts.options });
      } catch (err: unknown) {
        if (passkeyErrorKind(err) === "cancelled") {
          // User cancelled prompt -> do nothing
          return;
        }
        setError(failedMessage());
        return;
      }

      if (!cred) {
        return;
      }

      // 3. Verify assertion with server
      const user = await verifyLoginAssertion(cred, rememberMe);
      if (user) {
        signedIn = true;
        onLoginSuccess(user, "passkey");
      } else {
        setError(failedMessage());
      }
    } catch {
      setError(failedMessage());
    } finally {
      setIsLoading(false);
      if (!signedIn) onAfterModal?.();
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 mb-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-ui font-semibold animate-shake">
          <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={handlePasskeyLogin}
        className="w-full py-3.5 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-ui font-bold transition-all duration-150 flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin text-slate-500" />
            <span>{tr("Authenticating...", "Overujem...", "Hitelesítés...")}</span>
          </>
        ) : (
          <>
            <Fingerprint className="h-4.5 w-4.5 text-indigo-600 stroke-[2.2]" />
            <span>
              {platformAvailable
                ? tr(
                    "Sign in with fingerprint or face",
                    "Prihlásiť sa odtlačkom prsta alebo tvárou",
                    "Bejelentkezés ujjlenyomattal vagy arcfelismeréssel"
                  )
                : tr("Sign in with a passkey", "Prihlásiť sa prístupovým kľúčom", "Bejelentkezés hozzáférési kulccsal")}
            </span>
          </>
        )}
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 border-t border-slate-200" />
        <span className="type-overline text-slate-400">
          {tr("Or continue with email", "Alebo pokračujte e-mailom", "Vagy folytassa e-mailben")}
        </span>
        <div className="flex-1 border-t border-slate-200" />
      </div>
    </div>
  );
};
