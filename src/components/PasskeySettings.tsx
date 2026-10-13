import React, { useEffect, useState } from "react";
import {
  Fingerprint,
  Plus,
  Key,
  ShieldCheck,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import type { Language } from "../utils/translations";
import { PasswordInput } from "./PasswordInput";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { asLang } from "../utils/undoMessages";
import {
  isPasskeySupported,
  defaultPasskeyName,
  toCreationOptions,
  creationCredentialToJson,
  passkeyErrorKind,
  formatAgo,
} from "../utils/passkeys";

export interface PasskeySettingsProps {
  systemLanguage: Language;
}

interface PasskeyItem {
  id: number;
  name: string;
  authenticator: string | null;
  created_ago_seconds: number | null;
  last_used_ago_seconds: number | null;
}

export const PasskeySettings: React.FC<PasskeySettingsProps> = ({ systemLanguage }) => {
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const supported = isPasskeySupported();

  const loadPasskeys = async () => {
    try {
      const res = await fetch("/api/passkeys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.passkeys)) {
        setPasskeys(data.passkeys);
      }
    } catch {
      /* ignore */
    }
  };

  // Load status and passkeys list
  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const statusRes = await fetch("/api/passkeys.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status" }),
        });
        const statusData = await statusRes.json();
        if (!active) return;

        const isAvail = !!(statusData && statusData.success && statusData.available);
        setServerAvailable(isAvail);

        if (isAvail) {
          await loadPasskeys();
        }
      } catch {
        if (active) {
          setServerAvailable(false);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    init();
    return () => {
      active = false;
    };
  }, []);

  const handleOpenAdd = () => {
    setName(defaultPasskeyName(typeof navigator !== "undefined" ? navigator.userAgent : ""));
    setPassword("");
    setFormError(null);
    setShowAddPanel(true);
  };

  const handleCancelAdd = () => {
    setShowAddPanel(false);
    setName("");
    setPassword("");
    setFormError(null);
  };

  const handleRegister = async () => {
    if (!name.trim() || !password || isRegistering) return;

    setFormError(null);
    setIsRegistering(true);

    try {
      // 1. Get registration options (verifying current password)
      const optRes = await fetch("/api/passkeys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_options",
          password,
        }),
      });

      if (!optRes.ok) {
        if (optRes.status === 403) {
          setFormError(t("Wrong password.", "Nesprávne heslo.", "Hibás jelszó."));
          return;
        }
        let msg = t(
          "Passkey verification failed.",
          "Overenie prístupového kľúča zlyhalo.",
          "A hozzáférési kulcs ellenőrzése sikertelen."
        );
        try {
          const optData = await optRes.json();
          if (optData && typeof optData.message === "string") {
            msg = optData.message;
          }
        } catch {
          /* fallback */
        }
        setFormError(msg);
        return;
      }

      const optData = await optRes.json();
      if (!optData || !optData.success || !optData.options) {
        setFormError(
          t(
            "Passkey verification failed.",
            "Overenie prístupového kľúča zlyhalo.",
            "A hozzáférési kulcs ellenőrzése sikertelen."
          )
        );
        return;
      }

      // 2. Prompt client authenticator to create credential
      const creationOptions = toCreationOptions(optData.options);
      let cred: Credential | null = null;
      try {
        cred = await navigator.credentials.create({ publicKey: creationOptions });
      } catch (err: unknown) {
        const kind = passkeyErrorKind(err);
        if (kind === "cancelled") {
          return; // silent cancel
        }
        if (kind === "excluded") {
          setFormError(
            t(
              "This device already has a passkey for your account.",
              "Toto zariadenie už má pre váš účet prístupový kľúč.",
              "Ez az eszköz már rendelkezik hozzáférési kulccsal a fiókjához."
            )
          );
          return;
        }
        setFormError(
          t(
            "Passkey verification failed.",
            "Overenie prístupového kľúča zlyhalo.",
            "A hozzáférési kulcs ellenőrzése sikertelen."
          )
        );
        return;
      }

      if (!cred) {
        return;
      }

      // 3. Send attestation response to server
      const verifyRes = await fetch("/api/passkeys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_verify",
          name: name.trim(),
          credential: creationCredentialToJson(cred),
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyData && verifyData.success) {
        setShowAddPanel(false);
        setName("");
        setPassword("");
        await loadPasskeys();

        const successMsg = t("Passkey added.", "Prístupový kľúč bol pridaný.", "A hozzáférési kulcs hozzáadva.");
        setSuccessMessage(successMsg);
        const win = window as unknown as { showToast?: (m: string) => void };
        if (typeof win.showToast === "function") {
          win.showToast(successMsg);
        }
        setTimeout(() => {
          setSuccessMessage(null);
        }, 4000);
      } else {
        setFormError(
          verifyData?.message ||
            t(
              "Passkey verification failed.",
              "Overenie prístupového kľúča zlyhalo.",
              "A hozzáférési kulcs ellenőrzése sikertelen."
            )
        );
      }
    } catch {
      setFormError(
        t(
          "Passkey verification failed.",
          "Overenie prístupového kľúča zlyhalo.",
          "A hozzáférési kulcs ellenőrzése sikertelen."
        )
      );
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch("/api/passkeys.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (data && data.success) {
        setPasskeys((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="border-t border-slate-200/80 pt-4 space-y-3">
      {/* Heading & Description */}
      <div>
        <label className="type-overline text-slate-600 block">
          {t("Biometric login (passkeys)", "Biometrické prihlásenie (prístupové kľúče)", "Biometrikus bejelentkezés (hozzáférési kulcsok)")}
        </label>
        <p className="text-ui text-slate-500 font-medium mt-0.5">
          {t(
            "Sign in with your fingerprint, face or device PIN instead of a password.",
            "Prihláste sa odtlačkom prsta, tvárou alebo PIN-om zariadenia namiesto hesla.",
            "Jelentkezzen be ujjlenyomattal, arccal vagy az eszköz PIN-kódjával jelszó helyett."
          )}
        </p>
      </div>

      {/* Browser or Server unsupported states */}
      {!supported ? (
        <p className="text-ui text-slate-400 italic py-1">
          {t(
            "Passkeys are not supported in this browser.",
            "Tento prehliadač nepodporuje prístupové kľúče.",
            "Ez a böngésző nem támogatja a hozzáférési kulcsokat."
          )}
        </p>
      ) : serverAvailable === false ? (
        <p className="text-ui text-slate-400 italic py-1">
          {t(
            "Passkeys are not available on this server.",
            "Prístupové kľúče nie sú na tomto serveri dostupné.",
            "A hozzáférési kulcsok nem érhetők el ezen a szerveren."
          )}
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-3 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          {/* Success Feedback Banner */}
          {successMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-ui font-semibold animate-fade-in">
              <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Passkeys List Card */}
          {passkeys.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col items-center justify-center text-center space-y-2">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Fingerprint className="h-5 w-5" />
              </div>
              <p className="type-label text-slate-700 font-bold">
                {t("No passkeys yet", "Zatiaľ žiadne prístupové kľúče", "Még nincs hozzáférési kulcs")}
              </p>
              <p className="text-ui text-slate-500 font-medium">
                {t(
                  "Add a passkey to sign in without a password",
                  "Pridajte prístupový kľúč a prihlasujte sa bez hesla",
                  "Adjon hozzá egy hozzáférési kulcsot a jelszó nélküli bejelentkezéshez"
                )}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
              {passkeys.map((pk) => {
                const addedStr =
                  pk.created_ago_seconds !== null
                    ? `${t("Added", "Pridané", "Hozzáadva")} ${formatAgo(pk.created_ago_seconds, systemLanguage)}`
                    : "";
                const usedStr =
                  pk.last_used_ago_seconds !== null
                    ? `${t("Last used", "Naposledy použité", "Utoljára használva")} ${formatAgo(pk.last_used_ago_seconds, systemLanguage)}`
                    : "";
                const metaLine = [addedStr, usedStr].filter(Boolean).join(" / ");

                return (
                  <div key={pk.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-600 shrink-0">
                        <Key className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="type-label text-slate-800 font-bold truncate">
                            {pk.name}
                          </span>
                          {pk.authenticator && (
                            <span className="type-overline px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold shrink-0">
                              {pk.authenticator}
                            </span>
                          )}
                        </div>
                        {metaLine && (
                          <p className="text-ui text-slate-400 font-medium truncate mt-0.5">
                            {metaLine}
                          </p>
                        )}
                      </div>
                    </div>

                    <HoldToConfirmButton
                      tone="danger"
                      lang={asLang(systemLanguage)}
                      what={t("passkey", "prístupový kľúč", "hozzáférési kulcs")}
                      onConfirm={() => handleDelete(pk.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </HoldToConfirmButton>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Passkey Button or Panel */}
          {!showAddPanel ? (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-ui font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{t("Add passkey", "Pridať prístupový kľúč", "Hozzáférési kulcs hozzáadása")}</span>
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
                <span className="type-label font-bold">
                  {t("Add passkey", "Pridať prístupový kľúč", "Hozzáférési kulcs hozzáadása")}
                </span>
              </div>

              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-ui font-semibold animate-shake">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Passkey Name Input */}
              <div className="space-y-1">
                <label htmlFor="passkey-name" className="type-overline text-slate-600 block">
                  {t("Passkey name", "Názov prístupového kľúča", "A hozzáférési kulcs neve")}
                </label>
                <input
                  id="passkey-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("e.g. MacBook Pro, iPhone", "napr. MacBook Pro, iPhone", "pl. MacBook Pro, iPhone")}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-ui text-slate-400 font-medium">
                  {t(
                    "A name helps you identify this passkey later.",
                    "Názov vám pomôže tento kľúč neskôr rozpoznať.",
                    "A név segít később azonosítani ezt a kulcsot."
                  )}
                </p>
              </div>

              {/* Current Password Confirmation Input */}
              <div className="space-y-1">
                <label htmlFor="passkey-current-password" className="type-overline text-slate-600 block">
                  {t(
                    "Confirm with your current password",
                    "Potvrďte súčasným heslom",
                    "Erősítse meg a jelenlegi jelszavával"
                  )}
                </label>
                <PasswordInput
                  id="passkey-current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isRegistering || !name.trim() || !password}
                  onClick={handleRegister}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white rounded-xl text-ui font-bold transition-all flex items-center gap-2 active:scale-95 shadow-sm"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t("Registering...", "Registrujem...", "Regisztrálás...")}</span>
                    </>
                  ) : (
                    <span>{t("Register passkey", "Zaregistrovať prístupový kľúč", "Hozzáférési kulcs regisztrálása")}</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isRegistering}
                  onClick={handleCancelAdd}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-ui font-semibold transition-all active:scale-95"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
