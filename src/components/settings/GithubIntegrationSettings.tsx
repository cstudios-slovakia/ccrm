import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle } from "lucide-react";
import type { Language } from "../../utils/translations";
import { SectionCard, SettingsGroup } from "./SectionCard";
import { useConfirmDialog } from "../ui/ConfirmDialog";

type T = (en: string, sk: string, hu: string) => string;

interface Status {
  webhookUrl: string;
  hasSecret: boolean;
  /** A value is stored but cannot be decrypted (the server's encryption key changed): deliveries are refused. */
  unreadable: boolean;
}

const ENDPOINT = "/api/github_integration.php";

const showToast = (message: string, variant?: "error" | "warning") =>
  (window as unknown as { showToast?: (m: string, v?: string) => void }).showToast?.(message, variant);

const primaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-ui font-bold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const secondaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-ui font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const readonlyCls =
  "min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-ui text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const CopyButton: React.FC<{ text: string; t: T }> = ({ text, t }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={secondaryBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          showToast(t("Could not copy. Select the text and copy it by hand.", "Kopírovanie sa nepodarilo. Označte text a skopírujte ho ručne.", "A másolás nem sikerült. Jelölje ki a szöveget, és másolja ki kézzel."), "error");
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? t("Copied!", "Skopírované!", "Másolva!") : t("Copy", "Kopírovať", "Másolás")}
    </button>
  );
};

/**
 * Settings → Integrations → GitHub: the webhook address and secret key GitHub needs to tell this system
 * about every push to a paired project's server branch. Administrators only (the endpoint is too). The
 * secret is shown once, in the answer that created it, and is never readable again.
 */
export const GithubIntegrationSettings: React.FC<{ userLanguage: Language }> = ({ userLanguage }) => {
  const t: T = (en, sk, hu) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const [confirm, confirmNode] = useConfirmDialog();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [generating, setGenerating] = useState(false);
  // The plaintext secret lives in the browser only until the admin dismisses it or leaves.
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { credentials: "same-origin" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success === true) setStatus({ webhookUrl: String(data.webhookUrl ?? ""), hasSecret: data.hasSecret === true, unreadable: data.unreadable === true });
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    // An unreadable key already works for nobody, so replacing it needs no warning about the old one.
    if (status?.hasSecret) {
      const ok = await confirm({
        title: t("Generate a new secret key?", "Vygenerovať nový tajný kľúč?", "Új titkos kulcsot generál?"),
        message: t(
          "The old key stops working at once. GitHub's deliveries are refused until you paste the new key into the webhook there.",
          "Starý kľúč okamžite prestane fungovať. Doručenia z GitHubu sa odmietnu, kým nový kľúč nevložíte do webhooku na GitHube.",
          "A régi kulcs azonnal megszűnik működni. A GitHub kézbesítései addig elutasításra kerülnek, amíg az új kulcsot be nem illeszti az ottani webhookba.",
        ),
        confirmLabel: t("Generate new key", "Vygenerovať nový kľúč", "Új kulcs generálása"),
        cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
        danger: true,
      });
      if (!ok) return;
    }
    setGenerating(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success === true && typeof data.secret === "string") {
        setNewSecret(data.secret);
        setStatus((s) => (s ? { ...s, hasSecret: true, unreadable: false } : s));
      } else {
        showToast(t("Could not generate the key.", "Kľúč sa nepodarilo vygenerovať.", "A kulcsot nem sikerült generálni."), "error");
      }
    } catch {
      showToast(t("Could not generate the key.", "Kľúč sa nepodarilo vygenerovať.", "A kulcsot nem sikerült generálni."), "error");
    } finally {
      setGenerating(false);
    }
  };

  const title = "GitHub";
  if (loadFailed) {
    return (
      <SectionCard title={title} tone="warning">
        <p className="type-body text-amber-800">
          {t("The GitHub settings could not be loaded. Reload the page and try again.", "Nastavenia GitHubu sa nepodarilo načítať. Obnovte stránku a skúste to znova.", "A GitHub-beállításokat nem sikerült betölteni. Töltse újra az oldalt, és próbálja újra.")}
        </p>
      </SectionCard>
    );
  }
  if (!status) return <div className="h-40 rounded-3xl bg-slate-50 animate-pulse" />;

  const steps = [
    t(
      "In GitHub open the organisation's or the repository's Settings, then Webhooks, then Add webhook.",
      "Na GitHube otvorte Settings organizácie alebo repozitára, potom Webhooks a Add webhook.",
      "A GitHubon nyissa meg a szervezet vagy a repozitórium Settings oldalát, majd a Webhooks, végül az Add webhook gombot.",
    ),
    t(
      "Paste the webhook address into Payload URL and set Content type to application/json.",
      "Adresu webhooku vložte do Payload URL a Content type nastavte na application/json.",
      "A webhook címét illessze a Payload URL mezőbe, a Content type értéke legyen application/json.",
    ),
    t("Paste the secret key into Secret.", "Tajný kľúč vložte do poľa Secret.", "A titkos kulcsot illessze a Secret mezőbe."),
    t(
      "Under events choose Just the push event, then save the webhook.",
      "V udalostiach vyberte Just the push event a webhook uložte.",
      "Az események között válassza a Just the push event lehetőséget, majd mentse a webhookot.",
    ),
    t(
      "Open a project and fill in \"Repository\" in its GitHub group (and \"Branch\" if the server runs another branch than the default one).",
      "Otvorte projekt a v skupine GitHub vyplňte „Repozitár“ (a „Vetvu“, ak server nebeží na predvolenej vetve).",
      "Nyisson meg egy projektet, és a GitHub csoportban töltse ki a „Repozitórium” mezőt (és az „Ág” mezőt, ha a szerver nem az alapértelmezett ágat futtatja).",
    ),
  ];

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title={title}
        description={t(
          "GitHub tells this system about every push to the server branch of a paired project, so deployments can be shown with the project.",
          "GitHub oznámi systému každý push do serverovej vetvy prepojeného projektu, takže nasadenia sa dajú zobraziť pri projekte.",
          "A GitHub minden pushról értesíti a rendszert, amely egy párosított projekt szerver-ágára érkezik, így a telepítések a projektnél megjeleníthetők.",
        )}
      >
        <SettingsGroup title={t("Webhook address", "Adresa webhooku", "Webhook címe")}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={status.webhookUrl}
              aria-label={t("Webhook address", "Adresa webhooku", "Webhook címe")}
              onFocus={(e) => e.currentTarget.select()}
              className={readonlyCls}
              data-testid="github-webhook-url"
            />
            <CopyButton text={status.webhookUrl} t={t} />
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("Secret key", "Tajný kľúč", "Titkos kulcs")}>
          <div className="flex flex-wrap items-center gap-3">
            {status.unreadable ? (
              <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 type-body text-amber-800" data-testid="github-secret-state">
                {t(
                  "A secret key is stored but cannot be read. Generate a new one.",
                  "Tajný kľúč je uložený, ale nedá sa prečítať. Vygenerujte nový.",
                  "A titkos kulcs el van mentve, de nem olvasható. Generáljon újat.",
                )}
              </p>
            ) : (
              <p className="type-body text-slate-700" data-testid="github-secret-state">
                {status.hasSecret ? t("The secret key is set.", "Tajný kľúč je nastavený.", "A titkos kulcs be van állítva.") : t("The secret key is not set.", "Tajný kľúč nie je nastavený.", "A titkos kulcs nincs beállítva.")}
              </p>
            )}
            <button type="button" className={primaryBtn} onClick={generate} disabled={generating} data-testid="github-generate-secret">
              {generating ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
              {status.hasSecret ? t("Generate new key", "Vygenerovať nový kľúč", "Új kulcs generálása") : t("Generate secret key", "Vygenerovať tajný kľúč", "Titkos kulcs generálása")}
            </button>
          </div>
          {newSecret && (
            <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="type-label text-amber-900">
                {t(
                  "Copy it now. It cannot be shown again.",
                  "Skopírujte ho hneď. Znova sa zobraziť nedá.",
                  "Másolja ki most. Többé nem jeleníthető meg.",
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newSecret}
                  aria-label={t("Secret key", "Tajný kľúč", "Titkos kulcs")}
                  onFocus={(e) => e.currentTarget.select()}
                  className={readonlyCls}
                  data-testid="github-new-secret"
                />
                <CopyButton text={newSecret} t={t} />
              </div>
              <div>
                <button type="button" className={secondaryBtn} onClick={() => setNewSecret(null)}>
                  {t("I have saved it", "Uložil som si ho", "Elmentettem")}
                </button>
              </div>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("How to connect GitHub", "Ako pripojiť GitHub", "A GitHub csatlakoztatása")}>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 type-body text-slate-700">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </SettingsGroup>
      </SectionCard>
      {confirmNode}
    </div>
  );
};
