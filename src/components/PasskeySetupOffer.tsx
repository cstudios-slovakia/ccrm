import React, { useEffect, useState } from "react";
import { Fingerprint, Loader2, AlertCircle } from "lucide-react";
import type { Language } from "../utils/translations";
import { PasswordInput } from "./PasswordInput";
import { defaultPasskeyName, shouldOfferPasskeySetup, type LoginMethod } from "../utils/passkeys";
import {
  dismissPasskeyOffer,
  fetchPasskeyStatus,
  isPasskeyOfferDismissed,
  isPasskeyOnThisDevice,
  markPasskeyOnThisDevice,
  platformAuthenticatorAvailable,
  reconcilePasskeyMarker,
  registerPasskey,
} from "../utils/passkeyCeremony";

export interface PasskeySetupOfferProps {
  systemLanguage: Language;
  /** How this session was opened. Only "password" is offered the setup. */
  loginMethod: LoginMethod | null;
}

/** Matches the exit transition below; the card unmounts once it has faded out. */
const EXIT_MS = 150;

export const PasskeySetupOffer: React.FC<PasskeySetupOfferProps> = ({ systemLanguage, loginMethod }) => {
  const [eligible, setEligible] = useState(false);
  const [hiddenForSession, setHiddenForSession] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  useEffect(() => {
    if (loginMethod !== "password") return;
    let active = true;
    // A marker left behind by a removed passkey would otherwise suppress the offer for good.
    Promise.all([fetchPasskeyStatus(), platformAuthenticatorAvailable(), reconcilePasskeyMarker()]).then(([available, platformAvailable]) => {
      if (!active) return;
      setEligible(
        shouldOfferPasskeySetup({
          loginMethod,
          available,
          platformAvailable,
          onThisDevice: isPasskeyOnThisDevice(),
          dismissed: isPasskeyOfferDismissed(),
        })
      );
    });
    return () => {
      active = false;
    };
  }, [loginMethod]);

  if (!eligible || hiddenForSession) return null;

  const close = () => {
    setClosing(true);
    setTimeout(() => setHiddenForSession(true), EXIT_MS);
  };

  const toast = (message: string) => {
    const win = window as unknown as { showToast?: (m: string) => void };
    if (typeof win.showToast === "function") win.showToast(message);
  };

  const handleSetUp = async () => {
    if (isBusy || (needsPassword && !password)) return;
    setError(null);
    setIsBusy(true);
    try {
      const result = await registerPasskey({
        name: defaultPasskeyName(typeof navigator !== "undefined" ? navigator.userAgent : ""),
        password: needsPassword ? password : undefined,
      });

      switch (result.kind) {
        case "ok":
          markPasskeyOnThisDevice();
          toast(t("Passkey added.", "Prístupový kľúč bol pridaný.", "A hozzáférési kulcs hozzáadva."));
          close();
          return;
        case "cancelled":
          return; // the user closed the OS prompt; the card stays so they can retry
        case "excluded":
          markPasskeyOnThisDevice();
          toast(
            t(
              "This device already has a passkey for your account.",
              "Toto zariadenie už má pre váš účet prístupový kľúč.",
              "Ez az eszköz már rendelkezik hozzáférési kulccsal a fiókjához."
            )
          );
          close();
          return;
        case "password-required":
          // The five-minute window after sign-in has passed.
          setNeedsPassword(true);
          return;
        case "wrong-password":
          setNeedsPassword(true);
          setError(t("Wrong password.", "Nesprávne heslo.", "Hibás jelszó."));
          return;
        default:
          setError(
            result.message ||
              t(
                "Passkey verification failed.",
                "Overenie prístupového kľúča zlyhalo.",
                "A hozzáférési kulcs ellenőrzése sikertelen."
              )
          );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleNever = () => {
    dismissPasskeyOffer();
    close();
  };

  const ghostButton =
    "px-3 py-2 rounded-xl text-ui font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 cursor-pointer";

  return (
    <section
      role="region"
      aria-label={t("Sign in with fingerprint or face", "Prihlásenie odtlačkom prsta alebo tvárou", "Bejelentkezés ujjlenyomattal vagy arccal")}
      className={`pointer-events-auto w-88 max-w-[calc(100vw-3rem)] rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 space-y-3 text-left transition-all duration-150 ease-out ${
        closing ? "opacity-0 translate-y-2" : "animate-in fade-in slide-in-from-bottom duration-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-600 shrink-0">
          <Fingerprint className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="type-label text-slate-800 font-bold">
            {t(
              "Sign in with your fingerprint or face next time?",
              "Prihlásiť sa nabudúce odtlačkom prsta alebo tvárou?",
              "Legközelebb ujjlenyomattal vagy arccal jelentkezik be?"
            )}
          </p>
          <p className="text-ui text-slate-500 font-medium">
            {t(
              "Your device will ask to confirm it is you. Depending on the device, that is a fingerprint, your face or its PIN.",
              "Zariadenie vás požiada o potvrdenie, že ste to vy. Podľa zariadenia to bude odtlačok prsta, tvár alebo jeho PIN.",
              "Az eszköz megerősítést kér, hogy Ön az. Az eszköztől függően ez ujjlenyomat, arc vagy az eszköz PIN-kódja lehet."
            )}
          </p>
        </div>
      </div>

      {needsPassword && (
        <div className="space-y-1 animate-in fade-in slide-in-from-top duration-200">
          <label htmlFor="passkey-offer-password" className="type-overline text-slate-600 block">
            {t("Confirm with your current password", "Potvrďte súčasným heslom", "Erősítse meg a jelenlegi jelszavával")}
          </label>
          <PasswordInput
            id="passkey-offer-password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetUp();
            }}
            placeholder="••••••••"
            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-ui font-semibold animate-shake">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={isBusy || (needsPassword && !password)}
          onClick={handleSetUp}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white rounded-xl text-ui font-bold transition-all duration-150 flex items-center gap-2 active:scale-95 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 cursor-pointer"
        >
          {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{t("Set up", "Nastaviť", "Beállítás")}</span>
        </button>
        <button type="button" disabled={isBusy} onClick={close} className={ghostButton}>
          {t("Not now", "Teraz nie", "Most nem")}
        </button>
        <button type="button" disabled={isBusy} onClick={handleNever} className={ghostButton}>
          {t("Don't ask again", "Viac sa nepýtať", "Ne kérdezze többet")}
        </button>
      </div>
    </section>
  );
};
