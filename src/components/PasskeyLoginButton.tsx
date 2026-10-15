import React, { useEffect, useState } from "react";
import { Fingerprint, Loader2, AlertCircle } from "lucide-react";
import type { Language } from "../utils/translations";
import type { UserProfile } from "../types";
import {
  isPasskeySupported,
  toRequestOptions,
  assertionCredentialToJson,
  passkeyErrorKind,
} from "../utils/passkeys";

export interface PasskeyLoginButtonProps {
  systemLanguage: Language;
  rememberMe: boolean;
  onLoginSuccess: (user: UserProfile) => void;
  disabled?: boolean;
}

export const PasskeyLoginButton: React.FC<PasskeyLoginButtonProps> = ({
  systemLanguage,
  rememberMe,
  onLoginSuccess,
  disabled = false,
}) => {
  const [available, setAvailable] = useState<boolean | null>(() =>
    isPasskeySupported() ? null : false
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tr = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  useEffect(() => {
    if (!isPasskeySupported()) {
      return;
    }

    let isMounted = true;
    fetch("/api/passkeys.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setAvailable(!!(data && data.success && data.available));
        }
      })
      .catch(() => {
        if (isMounted) {
          setAvailable(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (available !== true) {
    return null;
  }

  const handlePasskeyLogin = async () => {
    if (disabled || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      // 1. Fetch login options
      const optRes = await fetch("/api/passkeys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login_options" }),
      });

      if (!optRes.ok) {
        if (optRes.status === 429) {
          setError(
            tr(
              "Too many login attempts. Please wait a few minutes and try again.",
              "Príliš veľa pokusov o prihlásenie. Počkajte niekoľko minút a skúste to znova.",
              "Túl sok bejelentkezési kísérlet. Kérjük, várjon néhány percet, és próbálja újra."
            )
          );
          return;
        }
        let msg = tr(
          "Passkey sign-in failed. Try again or use your email and password.",
          "Prihlásenie prístupovým kľúčom zlyhalo. Skúste znova alebo použite e-mail a heslo.",
          "A hozzáférési kulcsos bejelentkezés sikertelen. Próbálja újra, vagy használja az e-mailt és a jelszót."
        );
        try {
          const optData = await optRes.json();
          if (optData && typeof optData.message === "string") {
            msg = optData.message;
          }
        } catch {
          /* fallback */
        }
        setError(msg);
        return;
      }

      const optData = await optRes.json();
      if (!optData || !optData.success || !optData.options) {
        setError(
          tr(
            "Passkey sign-in failed. Try again or use your email and password.",
            "Prihlásenie prístupovým kľúčom zlyhalo. Skúste znova alebo použite e-mail a heslo.",
            "A hozzáférési kulcsos bejelentkezés sikertelen. Próbálja újra, vagy használja az e-mailt és a jelszót."
          )
        );
        return;
      }

      // 2. Browser biometric prompt
      const requestOptions = toRequestOptions(optData.options);
      let cred: Credential | null = null;
      try {
        cred = await navigator.credentials.get({ publicKey: requestOptions });
      } catch (err: unknown) {
        const kind = passkeyErrorKind(err);
        if (kind === "cancelled") {
          // User cancelled prompt -> do nothing
          return;
        }
        setError(
          tr(
            "Passkey sign-in failed. Try again or use your email and password.",
            "Prihlásenie prístupovým kľúčom zlyhalo. Skúste znova alebo použite e-mail a heslo.",
            "A hozzáférési kulcsos bejelentkezés sikertelen. Próbálja újra, vagy használja az e-mailt és a jelszót."
          )
        );
        return;
      }

      if (!cred) {
        return;
      }

      // 3. Verify assertion with server
      const verifyRes = await fetch("/api/passkeys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login_verify",
          credential: assertionCredentialToJson(cred),
          remember: rememberMe,
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyData && verifyData.success && verifyData.user) {
        onLoginSuccess(verifyData.user as UserProfile);
      } else {
        setError(
          tr(
            "Passkey sign-in failed. Try again or use your email and password.",
            "Prihlásenie prístupovým kľúčom zlyhalo. Skúste znova alebo použite e-mail a heslo.",
            "A hozzáférési kulcsos bejelentkezés sikertelen. Próbálja újra, vagy használja az e-mailt és a jelszót."
          )
        );
      }
    } catch {
      setError(
        tr(
          "Passkey sign-in failed. Try again or use your email and password.",
          "Prihlásenie prístupovým kľúčom zlyhalo. Skúste znova alebo použite e-mail a heslo.",
          "A hozzáférési kulcsos bejelentkezés sikertelen. Próbálja újra, vagy használja az e-mailt és a jelszót."
        )
      );
    } finally {
      setIsLoading(false);
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
              {tr("Sign in with a passkey", "Prihlásiť sa prístupovým kľúčom", "Bejelentkezés hozzáférési kulccsal")}
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
