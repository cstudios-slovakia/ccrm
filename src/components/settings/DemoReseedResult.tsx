import React, { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CircleAlert, CircleCheck, KeyRound } from "lucide-react";
import type { Language } from "../../utils/translations";

/**
 * What a re-seed answered (api/demo_reseed.php, POST). Kept here, next to the dialog that shows it.
 */
export interface ReseedModuleReport {
  ok: boolean;
  rows: number;
  error: string | null;
  skipped?: boolean;
}

export interface ReseedResult {
  language: string;
  currency: string;
  resetCompany: boolean;
  wiped: Record<string, number>;
  report: Record<string, ReseedModuleReport>;
  failed: string[];
  logins: { role: string; name: string; email: string }[];
  password: string;
  loginsReady: boolean;
}

const tr = (lang: Language, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

/** Module key (api/demo_seed/index.php: demo_seed_modules) -> its name in the three UI languages. */
const MODULE_LABELS: Record<string, [string, string, string]> = {
  company: ["Company profile and divisions", "Profil spoločnosti a divízie", "Cégprofil és divíziók"],
  employees: ["Employees", "Zamestnanci", "Munkatársak"],
  clients: ["Clients and leads", "Klienti a leady", "Ügyfelek és leadek"],
  projects: ["Projects", "Projekty", "Projektek"],
  tasks: ["Tasks", "Úlohy", "Feladatok"],
  offers: ["Offers and invoices", "Ponuky a faktúry", "Ajánlatok és számlák"],
  warehouse: ["Warehouse", "Sklad", "Raktár"],
  orders: ["Orders", "Objednávky", "Rendelések"],
  finance: ["Finance", "Financie", "Pénzügyek"],
  tickets: ["Service tickets", "Servisné tikety", "Szerviz jegyek"],
  time: ["Time tracking", "Sledovanie času", "Időkövetés"],
  whatsapp: ["WhatsApp", "WhatsApp", "WhatsApp"],
  email: ["E-mail", "E-mail", "E-mail"],
  meetings: ["AI meeting room", "AI zasadačka", "AI tárgyaló"],
  workflows: ["Automations", "Automatizácie", "Automatizálások"],
  sai: ["SAI simulations", "SAI simulácie", "SAI szimulációk"],
};

export function reseedModuleLabel(lang: Language, module: string): string {
  const l = MODULE_LABELS[module];
  return l ? tr(lang, l[0], l[1], l[2]) : module;
}

/**
 * The per-module result table: module, then the rows it wrote or the reason it did not.
 * Used inside the dialog; a failed module is rose, one this version cannot seed yet is muted.
 */
export const ReseedReportTable: React.FC<{ report: Record<string, ReseedModuleReport>; language: Language }> = ({ report, language }) => (
  <table className="w-full text-left" data-testid="demo-reseed-report">
    <thead>
      <tr className="border-b border-slate-200">
        <th scope="col" className="type-overline py-2 pr-3 text-slate-500">{tr(language, "Module", "Modul", "Modul")}</th>
        <th scope="col" className="type-overline py-2 text-right text-slate-500">{tr(language, "Rows / result", "Riadky / výsledok", "Sorok / eredmény")}</th>
      </tr>
    </thead>
    <tbody>
      {Object.entries(report).map(([module, r]) => (
        <tr key={module} data-module={module} data-state={r.skipped ? "skipped" : r.ok ? "ok" : "failed"} className="border-b border-slate-100 last:border-0">
          <td className="py-2 pr-3 text-ui text-slate-800">{reseedModuleLabel(language, module)}</td>
          <td className="py-2 text-right text-ui">
            {r.skipped ? (
              <span className="text-slate-400">{tr(language, "not in this version", "nie je v tejto verzii", "ebben a verzióban nincs")}</span>
            ) : r.ok ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <CircleCheck className="h-4 w-4" aria-hidden="true" /> {r.rows}
              </span>
            ) : (
              <span className="inline-flex items-start gap-1 font-semibold text-rose-700">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {r.error || tr(language, "failed", "zlyhalo", "sikertelen")}
              </span>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * The dialog shown after a re-seed: the new logins and their password, then the per-module table.
 *
 * It is NOT part of the Settings screen on purpose. The demo logins were replaced and the server
 * ended this session, so within seconds the app drops to the login screen and unmounts Settings.
 * The dialog lives in its own React root (see showReseedResult) so it is still there for the person
 * to read; its button reloads the page, which lands on the demo login picker.
 */
export const ReseedResultDialog: React.FC<{ result: ReseedResult; language: Language; onContinue: () => void }> = ({ result, language, onContinue }) => {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus(); }, []);
  const wipedRows = Object.values(result.wiped).reduce((a, b) => a + b, 0);
  const t = (en: string, sk: string, hu: string) => tr(language, en, sk, hu);
  return (
    <div className="fixed inset-0 z-[100050] flex items-center justify-center bg-slate-900/50 p-4" data-testid="demo-reseed-result">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-reseed-result-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-3xl border border-white/60 bg-white p-6 text-left shadow-glass"
      >
        <div className="flex flex-col gap-1">
          <h2 id="demo-reseed-result-title" className="type-panel-title font-heading text-slate-900">
            {result.failed.length === 0
              ? t("Demo data replaced", "Demo dáta boli nahradené", "A demó adatok lecserélődtek")
              : t("Demo data replaced, with problems", "Demo dáta boli nahradené, s problémami", "A demó adatok lecserélődtek, hibákkal")}
          </h2>
          <p className="type-body text-slate-500">
            {t(
              `${wipedRows} old demo rows removed; the demo is now ${result.language.toUpperCase()} / ${result.currency}. You were signed out because the demo logins were replaced.`,
              `Odstránených ${wipedRows} starých demo riadkov; demo je teraz ${result.language.toUpperCase()} / ${result.currency}. Boli ste odhlásení, pretože demo prihlásenia boli nahradené.`,
              `${wipedRows} régi demó sor törölve; a demó mostantól ${result.language.toUpperCase()} / ${result.currency}. Kijelentkeztettük, mert a demó belépések lecserélődtek.`,
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4" data-testid="demo-reseed-logins">
          <div className="flex items-center gap-2 text-ui font-bold text-indigo-900">
            <KeyRound className="h-4 w-4" aria-hidden="true" /> {t("New demo logins", "Nové demo prihlásenia", "Új demó belépések")}
          </div>
          {result.logins.length === 0 ? (
            <p className="text-ui font-semibold text-rose-700">
              {t("The demo logins could not be created. Check the company module below and re-seed again.", "Demo prihlásenia sa nepodarilo vytvoriť. Skontrolujte modul spoločnosti nižšie a skúste znova.", "A demó belépéseket nem sikerült létrehozni. Ellenőrizze lent a cég modult, és próbálja újra.")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {result.logins.map((l) => (
                <li key={l.email} className="flex flex-wrap items-baseline justify-between gap-x-3 text-ui text-slate-800">
                  <span className="font-semibold">{l.name}</span>
                  <span className="font-mono text-indigo-800" data-testid="demo-reseed-login-email">{l.email}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-ui text-slate-600">
            {t("Password for all of them:", "Heslo pre všetkých:", "Jelszó mindegyikhez:")}{" "}
            <span className="font-mono font-bold text-slate-900" data-testid="demo-reseed-password">{result.password}</span>
          </p>
        </div>

        <ReseedReportTable report={result.report} language={language} />

        <div className="flex justify-end">
          <button
            ref={button}
            type="button"
            onClick={onContinue}
            data-testid="demo-reseed-continue"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-ui font-bold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500"
          >
            {t("Go to the login screen", "Prejsť na prihlásenie", "Tovább a belépéshez")}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Show the dialog in a root of its own, outside the app's tree (see ReseedResultDialog).
 * Idempotent: a second call replaces the first. `onContinue` defaults to a page reload.
 */
let dialogRoot: Root | null = null;

export function showReseedResult(result: ReseedResult, language: Language, onContinue: () => void = () => window.location.reload()): void {
  const id = "demo-reseed-result-root";
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    document.body.appendChild(host);
    dialogRoot = null; // a new host needs a new root
  }
  if (!dialogRoot) dialogRoot = createRoot(host);
  dialogRoot.render(<ReseedResultDialog result={result} language={language} onContinue={onContinue} />);
}
