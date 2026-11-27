import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Copy } from "lucide-react";
import type { Language } from "../utils/translations";
import { fetchMicrosoftApp, saveMicrosoftApp, type MicrosoftAppRegistration } from "../utils/microsoftMail";
import { PRODUCT_NAME } from "../utils/brand";

/*
  ── MICROSOFT 365 APP REGISTRATION ──────────────────────

  Admin only. Signing a mailbox in with Microsoft needs an app registered in Microsoft Entra
  (client ID, client secret, optionally a tenant) whose redirect URI is this installation's
  own address. It is entered once here; every "Sign in with Microsoft" button uses it.
  The secret never comes back from the server: a mask stands for "keep the stored one".
*/

const inputClass =
  "w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-ui text-gray-800 focus:outline-none focus:border-entity-border disabled:bg-gray-50";
const labelClass = "type-overline text-gray-500 block mb-1";

export const MicrosoftAppSettings: React.FC<{ language: Language; onChanged?: () => void }> = ({ language, onChanged }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const [app, setApp] = useState<MicrosoftAppRegistration | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ clientId: "", tenantId: "", clientSecret: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchMicrosoftApp();
      // An answer without the address is not this endpoint (an older backend): stay hidden.
      setApp(next.redirectUri ? next : null);
      setForm({ clientId: next.clientId ?? "", tenantId: next.tenantId ?? "", clientSecret: next.clientSecret ?? "" });
    } catch {
      // An older backend, or not an admin: the block stays hidden.
      setApp(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!app) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveMicrosoftApp({ clientId: form.clientId.trim(), tenantId: form.tenantId.trim(), clientSecret: form.clientSecret });
      setSaved(true);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(app.redirectUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the address is selectable text */
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid="microsoft-app-settings">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span className="min-w-0">
          <span className="block text-ui font-bold text-gray-900">{t("Microsoft 365 sign-in", "Prihlásenie cez Microsoft 365", "Microsoft 365 bejelentkezés")}</span>
          <span className="block text-caption text-gray-500 mt-0.5">
            {app.configured
              ? app.source === "integrations"
                ? t("Set up, using the Exchange app details from the outgoing mail settings.", "Nastavené, používajú sa údaje aplikácie Exchange z nastavení odchádzajúcej pošty.", "Beállítva, a kimenő levelezés beállításaiban megadott Exchange-alkalmazás adataival.")
                : t("Set up. Exchange Online mailboxes can be connected with \"Sign in with Microsoft\".", "Nastavené. Schránky Exchange Online sa dajú pripojiť cez „Prihlásiť sa cez Microsoft“.", "Beállítva. Az Exchange Online postafiókok a „Bejelentkezés Microsofttal” gombbal csatlakoztathatók.")
              : t("Not set up. Needed for Exchange Online mailboxes, which no longer accept a password.", "Nenastavené. Potrebné pre schránky Exchange Online, ktoré už neprijímajú heslo.", "Nincs beállítva. Az Exchange Online postafiókokhoz szükséges, amelyek már nem fogadnak el jelszót.")}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {app.configured && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <form onSubmit={handleSave} className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-caption text-gray-600 leading-relaxed">
            {t(
              `Register an application in Microsoft Entra (Azure) → App registrations, add the address below as a Web redirect URI, create a client secret and grant the delegated Microsoft Graph permissions Mail.ReadWrite, Mail.Send, offline_access and User.Read (for shared company mailboxes also Mail.ReadWrite.Shared and Mail.Send.Shared). Then every user connects their mailbox to ${PRODUCT_NAME} by signing in. If the organisation does not let users approve applications, its Microsoft 365 administrator approves this one once.`,
              `Zaregistrujte aplikáciu v Microsoft Entra (Azure) → Registrácie aplikácií, pridajte nižšie uvedenú adresu ako webový Redirect URI, vytvorte klientsky kľúč (client secret) a udeľte delegované oprávnenia Microsoft Graph Mail.ReadWrite, Mail.Send, offline_access a User.Read (pre zdieľané firemné schránky aj Mail.ReadWrite.Shared a Mail.Send.Shared). Potom si každý používateľ pripojí schránku k ${PRODUCT_NAME} prihlásením. Ak organizácia nedovoľuje používateľom schvaľovať aplikácie, schváli ju raz jej administrátor Microsoft 365.`,
              `Regisztráljon egy alkalmazást a Microsoft Entra (Azure) → Alkalmazásregisztrációk részben, adja hozzá az alábbi címet webes átirányítási URI-ként, hozzon létre egy ügyféltitkot (client secret), és adja meg a Microsoft Graph delegált engedélyeit: Mail.ReadWrite, Mail.Send, offline_access és User.Read (megosztott céges postafiókokhoz a Mail.ReadWrite.Shared és Mail.Send.Shared is). Ezután minden felhasználó bejelentkezéssel csatlakoztatja postafiókját a ${PRODUCT_NAME} rendszerhez. Ha a szervezet nem engedi, hogy a felhasználók alkalmazásokat hagyjanak jóvá, a Microsoft 365 rendszergazdája egyszer jóváhagyja.`,
            )}
          </p>

          <div>
            <span className={labelClass}>{t("Redirect URI (copy it into the app registration)", "Redirect URI (skopírujte do registrácie aplikácie)", "Átirányítási URI (másolja az alkalmazásregisztrációba)")}</span>
            <div className="flex items-center gap-2">
              <code data-testid="microsoft-redirect-uri" className="flex-1 min-w-0 px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-caption text-gray-800 font-mono break-all select-all">{app.redirectUri}</code>
              <button
                type="button"
                onClick={copyRedirect}
                title={t("Copy", "Kopírovať", "Másolás")}
                className="p-2 rounded-md text-gray-500 hover:text-entity-text hover:bg-entity-soft active:scale-95 transition-all cursor-pointer shrink-0"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="msapp-client">{t("Application (client) ID", "ID aplikácie (klienta)", "Alkalmazás (ügyfél) azonosítója")}</label>
              <input id="msapp-client" className={`${inputClass} font-mono`} autoComplete="off" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div>
              <label className={labelClass} htmlFor="msapp-tenant">{t("Directory (tenant) ID — optional", "ID adresára (tenanta) — voliteľné", "Címtár (bérlő) azonosítója — nem kötelező")}</label>
              <input id="msapp-tenant" className={`${inputClass} font-mono`} autoComplete="off" value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} placeholder={t("empty = any organisation", "prázdne = ľubovoľná organizácia", "üres = bármely szervezet")} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="msapp-secret">{t("Client secret (value)", "Klientsky kľúč (hodnota)", "Ügyféltitok (érték)")}</label>
            <input id="msapp-secret" type="password" autoComplete="new-password" className={inputClass} value={form.clientSecret} onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))} />
            <p className="text-micro text-gray-400 mt-1">
              {t(
                "The saved secret is kept unless you type a new one. Microsoft secrets expire: when sign-ins start failing, create a new one and enter it here.",
                "Uložený kľúč sa zachová, kým nezadáte nový. Kľúče Microsoftu majú platnosť: keď prihlásenia začnú zlyhávať, vytvorte nový a zadajte ho sem.",
                "A mentett titok megmarad, amíg újat nem ír be. A Microsoft-titkok lejárnak: ha a bejelentkezések sikertelenek, hozzon létre újat, és adja meg itt.",
              )}
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{error}</span>
            </div>
          )}
          {saved && !error && (
            <div role="status" className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-ui font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("Saved.", "Uložené.", "Mentve.")}
            </div>
          )}

          <button type="submit" disabled={busy} className="px-4 py-2.5 bg-entity-solid hover:bg-entity-solid-hover text-white rounded-md text-ui font-bold active:scale-95 transition-all disabled:opacity-60 cursor-pointer">
            {busy ? t("Saving…", "Ukladá sa…", "Mentés…") : t("Save", "Uložiť", "Mentés")}
          </button>
        </form>
      )}
    </div>
  );
};
