import React, { useCallback, useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import type { Language } from "../../utils/translations";
import { asLang } from "../../utils/undoMessages";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { SectionCard, SettingsGroup } from "./SectionCard";
import { ReseedReportTable, reseedModuleLabel, showReseedResult, type ReseedResult } from "./DemoReseedResult";

/**
 * Settings > Reset data > Re-seed demo data.
 *
 * Replaces the demo records of an install in demo mode with the current dataset, in the language and
 * currency chosen here (api/demo_reseed.php; docs/DEMO-MODE.md phase 3). Only the demo rows and the
 * demo logins are replaced - records the user made stay. Shown only while DEMO_MODE is on: the caller
 * renders it for demo installs and this component also hides itself if the server says otherwise.
 */

interface DemoStatus {
  demoMode: boolean;
  language: string;
  currency: string;
  dataset: { version?: number; language?: string; currency?: string; seededAt?: string } | null;
  currentVersion: number;
  modules: string[];
  missing: string[];
  unavailable: string[];
  outdated: boolean;
}

const ENDPOINT = "/api/demo_reseed.php";

/** The currencies a demo can use (docs/DEMO-MODE.md B4); local, so this does not wait for the installer's list. */
const CURRENCIES: { code: string; symbol: string }[] = [
  { code: "EUR", symbol: "€" },
  { code: "HUF", symbol: "Ft" },
  { code: "CZK", symbol: "Kč" },
  { code: "PLN", symbol: "zł" },
  { code: "USD", symbol: "$" },
  { code: "GBP", symbol: "£" },
];
const LANGUAGES: { code: "sk" | "hu" | "en"; label: string }[] = [
  { code: "sk", label: "Slovenčina" },
  { code: "hu", label: "Magyar" },
  { code: "en", label: "English" },
];
/** B4: the currency a language starts with. */
const DEFAULT_CURRENCY: Record<string, string> = { sk: "EUR", hu: "HUF", en: "USD" };

const selectCls =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50";

const showToast = (message: string) => (window as unknown as { showToast?: (m: string) => void }).showToast?.(message);

export const DemoReseedSettings: React.FC<{ language: Language; canEdit: boolean }> = ({ language, canEdit }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);

  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadDetail, setLoadDetail] = useState<string | null>(null);
  const [lang, setLang] = useState("sk");
  const [currency, setCurrency] = useState("EUR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [resetCompany, setResetCompany] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ReseedResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${ENDPOINT}?status=1`, { credentials: "same-origin" });
      // A reply that is not JSON (a 404 page, a PHP fatal) still says something: keep its status.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success === false) {
        throw new Error(data ? [res.status, data.code, data.message].filter(Boolean).join(" · ") : `HTTP ${res.status}, not JSON`);
      }
      setStatus(data as DemoStatus);
      setLang(data.language);
      setCurrency(data.currency);
      setLoadFailed(false);
      setLoadDetail(null);
    } catch (e) {
      setLoadFailed(true);
      setLoadDetail(e instanceof Error ? e.message : null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const errorText = (code: string): string => {
    switch (code) {
      case "not_demo_mode": return t("This instance is not in demo mode.", "Táto inštancia nie je v demo režime.", "Ez a példány nincs demó módban.");
      case "busy": return t("A re-seed is already running.", "Opätovné načítanie už beží.", "Az újratöltés már fut.");
      case "invalid_language":
      case "invalid_currency": return t("Choose a language and a currency from the lists.", "Vyberte jazyk a menu zo zoznamov.", "Válasszon nyelvet és pénznemet a listákból.");
      case "forbidden": return t("Only an administrator with the Reset data permission can do this.", "Toto môže urobiť iba administrátor s oprávnením Reset dát.", "Ezt csak az Adatok visszaállítása jogosultsággal rendelkező rendszergazda teheti.");
      case "network": return t("Could not reach the server.", "Server sa nepodarilo kontaktovať.", "A szerver nem érhető el.");
      default: return t("The re-seed failed. Check the server log and try again.", "Opätovné načítanie zlyhalo. Skontrolujte log servera a skúste znova.", "Az újratöltés sikertelen. Nézze meg a szerver naplóját, és próbálja újra.");
    }
  };

  const run = async () => {
    if (running || !canEdit) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, currency, resetCompany }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) {
        setError(errorText(res.status === 403 ? "forbidden" : String(data.code ?? "failed")));
        return;
      }
      setLast(data as ReseedResult);
      showToast(t("Demo data replaced.", "Demo dáta boli nahradené.", "A demó adatok lecserélődtek."));
      // The demo logins were replaced and this session ended: say so in a dialog that outlives Settings.
      showReseedResult(data as ReseedResult, language);
    } catch {
      setError(errorText("network"));
    } finally {
      setRunning(false);
    }
  };

  if (loadFailed) {
    return (
      <SectionCard testId="demo-reseed" tone="warning" title={t("Re-seed demo data", "Znovu načítať demo dáta", "Demó adatok újratöltése")}>
        <p className="text-ui text-slate-600" data-testid="demo-reseed-load-error">
          {t("The demo status could not be read.", "Stav demo dát sa nepodarilo načítať.", "A demó állapotát nem sikerült beolvasni.")}{" "}
          <button type="button" className="cursor-pointer font-semibold text-indigo-600 underline" onClick={() => void load()}>
            {t("Try again", "Skúsiť znova", "Újra")}
          </button>
        </p>
        {loadDetail && (
          <p className="mt-2 break-words font-mono text-micro text-slate-500" data-testid="demo-reseed-load-detail">{loadDetail}</p>
        )}
      </SectionCard>
    );
  }
  // Not in demo mode on the server (or still loading): nothing to offer.
  if (!status || !status.demoMode) return null;

  // What a re-seed would add: the modules the install lacks that this version can seed.
  const addable = status.missing.filter((m) => !status.unavailable.includes(m));
  const older = status.dataset === null || status.outdated;
  const showNotice = older || addable.length > 0;

  return (
    <SectionCard
      testId="demo-reseed"
      tone="warning"
      title={t("Re-seed demo data", "Znovu načítať demo dáta", "Demó adatok újratöltése")}
      description={t(
        "Replace the demo records with the current dataset, in the language and currency you choose. Everything you created yourself stays.",
        "Nahraďte demo záznamy aktuálnym súborom dát v zvolenom jazyku a mene. Všetko, čo ste vytvorili sami, zostane.",
        "Cserélje le a demó rekordokat az aktuális adatkészletre a választott nyelven és pénznemben. Minden, amit Ön hozott létre, megmarad.",
      )}
    >
      {showNotice && (
        <div role="status" data-testid="demo-reseed-notice" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-ui text-amber-900">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {addable.length > 0
              ? t(
                  `Your demo data predates: ${addable.map((m) => reseedModuleLabel("en", m)).join(", ")}. Re-seed to add them.`,
                  `Vaše demo dáta nezahŕňajú: ${addable.map((m) => reseedModuleLabel("sk", m)).join(", ")}. Znovu ich načítajte, aby sa doplnili.`,
                  `A demó adatai még nem tartalmazzák: ${addable.map((m) => reseedModuleLabel("hu", m)).join(", ")}. Töltse újra őket a pótlásukhoz.`,
                )
              : t(
                  "Your demo data was created by an older version. Re-seed to bring it up to date.",
                  "Vaše demo dáta vytvorila staršia verzia. Znovu ich načítajte, aby boli aktuálne.",
                  "A demó adatait egy régebbi verzió hozta létre. Töltse újra az aktualizáláshoz.",
                )}
          </p>
        </div>
      )}

      <SettingsGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-slate-800">{t("Demo data language", "Jazyk demo dát", "Demóadatok nyelve")}</span>
            <select
              data-testid="demo-reseed-language"
              className={selectCls}
              value={lang}
              disabled={running || !canEdit}
              onChange={(e) => {
                setLang(e.target.value);
                if (!currencyTouched) setCurrency(DEFAULT_CURRENCY[e.target.value] ?? currency);
              }}
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-slate-800">{t("Currency", "Mena", "Pénznem")}</span>
            <select
              data-testid="demo-reseed-currency"
              className={selectCls}
              value={currency}
              disabled={running || !canEdit}
              onChange={(e) => { setCurrency(e.target.value); setCurrencyTouched(true); }}
            >
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
            </select>
          </label>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="demo-reseed-reset-company"
            className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
            checked={resetCompany}
            disabled={running || !canEdit}
            onChange={(e) => setResetCompany(e.target.checked)}
          />
          <span className="flex flex-col">
            <span className="type-label text-slate-800">
              {t("Also reset company profile, divisions and lists", "Resetovať aj profil spoločnosti, divízie a zoznamy", "A cégprofil, a divíziók és a listák visszaállítása is")}
            </span>
            <span className="type-meta text-slate-500">
              {t(
                "Rewrites the company profile, the divisions, and the pipeline states, sources, categories and task states in the chosen language. Untick it to keep your own.",
                "Prepíše profil spoločnosti, divízie, stavy pipeline, zdroje, kategórie a stavy úloh vo zvolenom jazyku. Odznačte, ak chcete zachovať vlastné.",
                "Újraírja a cégprofilt, a divíziókat, a pipeline állapotait, forrásait, kategóriáit és a feladatállapotokat a választott nyelven. Törölje a jelölést, ha a sajátjait meg szeretné tartani.",
              )}
            </span>
          </span>
        </label>
      </SettingsGroup>

      <p className="type-meta text-slate-600" data-testid="demo-reseed-confirm-text">
        {t(
          "This replaces every demo record and the demo logins, and signs you out. Records you created yourself are kept, but a link from one of them to a demo record may stop working.",
          "Nahradí všetky demo záznamy a demo prihlásenia a odhlási vás. Záznamy, ktoré ste vytvorili sami, zostanú, ale odkaz z nich na demo záznam môže prestať fungovať.",
          "Lecseréli az összes demó rekordot és a demó belépéseket, és kijelentkezteti. Az Ön által létrehozott rekordok megmaradnak, de egy demó rekordra mutató hivatkozásuk megszűnhet.",
        )}
      </p>

      {error && (
        <p role="alert" data-testid="demo-reseed-error" className="text-ui font-semibold text-rose-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {running && (
          <span className="inline-flex items-center gap-2 text-ui text-slate-500" data-testid="demo-reseed-running">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("Re-seeding… this can take a minute.", "Prebieha načítanie… môže to trvať minútu.", "Újratöltés… ez eltarthat egy percig.")}
          </span>
        )}
        <HoldToConfirmButton
          tone="danger"
          lang={asLang(language)}
          disabled={running || !canEdit}
          onConfirm={() => void run()}
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          hint={t("Hold to re-seed", "Podržte na opätovné načítanie", "Tartsa lenyomva az újratöltéshez")}
          aria-label={t("Re-seed demo data, hold to confirm", "Znovu načítať demo dáta, podržaním potvrďte", "Demó adatok újratöltése, tartsa lenyomva a megerősítéshez")}
          data-testid="demo-reseed-run"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-amber-300 bg-white px-5 text-ui font-bold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("Re-seed demo data", "Znovu načítať demo dáta", "Demó adatok újratöltése")}
        </HoldToConfirmButton>
      </div>

      {last && (
        <SettingsGroup title={t("Result of the last re-seed", "Výsledok posledného načítania", "Az utolsó újratöltés eredménye")}>
          <ReseedReportTable report={last.report} language={language} />
        </SettingsGroup>
      )}
    </SectionCard>
  );
};
